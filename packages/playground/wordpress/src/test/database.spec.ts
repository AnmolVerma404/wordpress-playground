import { createNodeFsMountHandler, loadNodeRuntime } from '@php-wasm/node';
import { PHP } from '@php-wasm/universal';
import { RecommendedPHPVersion } from '@wp-playground/common';
import {
	getSqliteDriverModule,
	getWordPressModule,
	MinifiedWordPressVersions,
} from '@wp-playground/wordpress-builds';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	rmdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bootWordPressAndRequestHandler } from '../boot';
import { getLoadedWordPressVersion } from '../version-detect';

describe('Test database', () => {
	let tempDir: string;

	beforeAll(() => {
		tempDir = join(tmpdir(), 'database-test');

		try {
			mkdirSync(
				join(
					tempDir,
					'wp-content',
					'mu-plugins',
					'sqlite-database-integration'
				),
				{ recursive: true }
			);
		} catch {
			// Ignore error if directory already exists
		}
	});

	afterAll(() => {
		rmdirSync(tempDir, { recursive: true });
	});

	it("should not start WordPress when SQLite ZIP not specified, the SQLite driver directory doesn't exist and MySQL can't be used", async () => {
		await expect(async () => {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			await using handler = await bootWordPressAndRequestHandler({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				wordPressZip: await getWordPressModule(),
				sqliteIntegrationPluginZip: undefined,
			});
		}).rejects.toThrow('Error connecting to the MySQL database.');
	});

	it(
		'should install WordPress in DELETE journal mode when SQL data path specified',
		async () => {
			await using handler = await bootWordPressAndRequestHandler({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				wordPressZip: await getWordPressModule(),
				sqliteIntegrationPluginZip: await getSqliteDriverModule(),
				dataSqlPath: '/wordpress/wp-content/database/.ht.sqlite',
			});

			const loadedWordPressVersion =
				await getLoadedWordPressVersion(handler);
			expect(loadedWordPressVersion).toBeTruthy();
			expect(Object.keys(MinifiedWordPressVersions)).toContain(
				loadedWordPressVersion
			);

			const php = await handler.getPrimaryPhp();
			const response = await php.run({
				code: `<?php
ob_start();
require getenv('DOCUMENT_ROOT') . '/wp-load.php';
ob_clean();
echo $GLOBALS['@pdo']->query('PRAGMA journal_mode')->fetchColumn();
`,
				env: {
					DOCUMENT_ROOT: '/wordpress',
				},
			});
			expect(response.errors).toHaveLength(0);
			expect(response.text).toBe('delete');
		},
		{ timeout: 30_000 }
	);

	it(
		'should honor explicit WAL journal mode',
		async () => {
			await using handler = await bootWordPressAndRequestHandler({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				wordPressZip: await getWordPressModule(),
				sqliteIntegrationPluginZip: await getSqliteDriverModule(),
				dataSqlPath: '/wordpress/wp-content/database/.ht.sqlite',
				constants: {
					SQLITE_JOURNAL_MODE: 'WAL',
				},
			});

			const php = await handler.getPrimaryPhp();
			const response = await php.run({
				code: `<?php
ob_start();
require getenv('DOCUMENT_ROOT') . '/wp-load.php';
ob_clean();
echo $GLOBALS['@pdo']->query('PRAGMA journal_mode')->fetchColumn();
`,
				env: {
					DOCUMENT_ROOT: '/wordpress',
				},
			});
			expect(response.errors).toHaveLength(0);
			expect(response.text).toBe('wal');
		},
		{ timeout: 30_000 }
	);

	it(
		'should not throw a pre-flight database error when SQLite is skipped and MySQL wp-config.php is provided',
		{ timeout: 30_000 },
		async () => {
			const wpConfigContent = readFileSync(
				join(__dirname, 'fixtures/wp-config-sample.php'),
				'utf-8'
			);
			const dbStubContent = readFileSync(
				join(__dirname, 'fixtures/mysql-db-stub.php'),
				'utf-8'
			);

			await expect(async () => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				await using handler = await bootWordPressAndRequestHandler({
					createPhpRuntime: async () =>
						await loadNodeRuntime(RecommendedPHPVersion),
					siteUrl: 'http://playground-domain/',
					wordPressZip: await getWordPressModule(),
					// Simulates --skip-sqlite-setup from the CLI
					sqliteIntegrationPluginZip: undefined,
					hooks: {
						beforeDatabaseSetup: async (php) => {
							php.writeFile(
								'/wordpress/wp-config.php',
								wpConfigContent
									.replace('database_name_here', 'foo')
									.replace('username_here', 'bar')
							);
							php.mkdir('/wordpress/wp-content');
							php.writeFile(
								'/wordpress/wp-content/db.php',
								dbStubContent
							);
						},
					},
				});
			}).rejects.not.toThrow('Error connecting to the MySQL database.');
		}
	);

	it(
		'should write the mysqli stub before the custom db.php guard',
		{ timeout: 30_000 },
		async () => {
			const dbStubContent = readFileSync(
				join(__dirname, 'fixtures/mysql-db-stub.php'),
				'utf-8'
			);

			await using handler = await bootWordPressAndRequestHandler({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				wordPressZip: await getWordPressModule(),
				sqliteIntegrationPluginZip: await getSqliteDriverModule(),
				wordpressInstallMode: 'do-not-attempt-installing',
				hooks: {
					beforeDatabaseSetup: async (php) => {
						await php.mkdir('/wordpress/wp-content');
						await php.writeFile(
							'/wordpress/wp-content/db.php',
							dbStubContent
						);
					},
				},
			});

			const php = await handler.getPrimaryPhp();
			const preload = await php.readFileAsText(
				'/internal/shared/preload/0-sqlite.php'
			);
			const guardPosition = preload.search(/if\s*\(\s*file_exists\s*\(/);
			const stubPosition = preload.indexOf('function mysqli_connect()');

			expect(guardPosition).toBeGreaterThanOrEqual(0);
			expect(stubPosition).toBeGreaterThanOrEqual(0);
			expect(stubPosition).toBeLessThan(guardPosition);
		}
	);

	it("should fail when the SQLite driver directory exists, but doesn't contain a valid driver", async () => {
		await expect(async () => {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			await using handler = await bootWordPressAndRequestHandler({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				wordPressZip: await getWordPressModule(),
				sqliteIntegrationPluginZip: undefined,
				hooks: {
					beforeWordPressFiles: async (php) => {
						await php.mount(
							'/wordpress',
							createNodeFsMountHandler(tempDir)
						);
					},
				},
			});
		}).rejects.toThrow('Error connecting to the SQLite database.');
	});

	it(
		'should place the SQLite plugin in mu-plugins on disk and work from a standalone PHP runtime at a different mount path',
		{ timeout: 60_000 },
		async () => {
			const siteDir = mkdtempSync(join(tmpdir(), 'sqlite-on-disk-'));
			try {
				await using handler = await bootWordPressAndRequestHandler({
					createPhpRuntime: async () =>
						await loadNodeRuntime(RecommendedPHPVersion),
					siteUrl: 'http://playground-domain/',
					wordPressZip: await getWordPressModule(),
					sqliteIntegrationPluginZip: await getSqliteDriverModule(),
					sqliteIntegrationPluginPath: 'mu-plugins',
					hooks: {
						beforeWordPressFiles: async (php) => {
							await php.mount(
								'/wordpress',
								createNodeFsMountHandler(siteDir)
							);
						},
					},
				});

				const loadedWordPressVersion =
					await getLoadedWordPressVersion(handler);
				expect(loadedWordPressVersion).toBeTruthy();

				const pluginDirOnDisk = join(
					siteDir,
					'wp-content',
					'mu-plugins',
					'sqlite-database-integration'
				);
				const dbPhpOnDisk = join(siteDir, 'wp-content', 'db.php');
				expect(existsSync(join(pluginDirOnDisk, 'load.php'))).toBe(
					true
				);
				expect(existsSync(dbPhpOnDisk)).toBe(true);
				const dbPhpContent = readFileSync(dbPhpOnDisk, 'utf-8');
				expect(dbPhpContent).toContain(
					"__DIR__ . '/mu-plugins/sqlite-database-integration'"
				);
				expect(dbPhpContent).not.toContain('/wordpress/');

				// Verify a standalone PHP runtime (simulating WP-CLI against a
				// stopped site or a portable export mounted at a different path)
				// can load WordPress and query SQLite without Playground preload.
				const standalonePhp = new PHP(
					await loadNodeRuntime(RecommendedPHPVersion)
				);
				try {
					standalonePhp.mkdir('/portable-site');
					await standalonePhp.mount(
						'/portable-site',
						createNodeFsMountHandler(siteDir)
					);
					const result = await standalonePhp.run({
						code: `<?php
if (!function_exists('mysqli_connect')) {
	function mysqli_connect() {}
}
define('WP_USE_THEMES', false);
require '/portable-site/wp-load.php';
global $wpdb;
echo get_class($wpdb) . '|' . get_option('blogname');
`,
					});
					expect(result.errors).toBe('');
					expect(result.text).toContain('WP_SQLite_DB|');
				} finally {
					standalonePhp.exit();
				}
			} finally {
				rmSync(siteDir, { recursive: true, force: true });
			}
		}
	);

	it(
		'should support placing the SQLite plugin in plugins and overwriting it cleanly on restart',
		{ timeout: 60_000 },
		async () => {
			const siteDir = mkdtempSync(join(tmpdir(), 'sqlite-plugins-'));
			try {
				await using firstBoot = await bootWordPressAndRequestHandler({
					createPhpRuntime: async () =>
						await loadNodeRuntime(RecommendedPHPVersion),
					siteUrl: 'http://playground-domain/',
					wordPressZip: await getWordPressModule(),
					sqliteIntegrationPluginZip: await getSqliteDriverModule(),
					sqliteIntegrationPluginPath: 'plugins',
					hooks: {
						beforeWordPressFiles: async (php) => {
							await php.mount(
								'/wordpress',
								createNodeFsMountHandler(siteDir)
							);
						},
					},
				});

				const pluginDirOnDisk = join(
					siteDir,
					'wp-content',
					'plugins',
					'sqlite-database-integration'
				);
				expect(existsSync(join(pluginDirOnDisk, 'load.php'))).toBe(
					true
				);
				expect(
					readFileSync(join(siteDir, 'wp-content', 'db.php'), 'utf-8')
				).toContain("__DIR__ . '/plugins/sqlite-database-integration'");
				expect(await getLoadedWordPressVersion(firstBoot)).toBeTruthy();

				// Restarting against the same directory should replace the
				// existing plugin directory cleanly without failing.
				await using secondBoot = await bootWordPressAndRequestHandler({
					createPhpRuntime: async () =>
						await loadNodeRuntime(RecommendedPHPVersion),
					siteUrl: 'http://playground-domain/',
					wordpressInstallMode:
						'install-from-existing-files-if-needed',
					sqliteIntegrationPluginZip: await getSqliteDriverModule(),
					sqliteIntegrationPluginPath: 'plugins',
					hooks: {
						beforeWordPressFiles: async (php) => {
							await php.mount(
								'/wordpress',
								createNodeFsMountHandler(siteDir)
							);
						},
					},
				});
				expect(
					await getLoadedWordPressVersion(secondBoot)
				).toBeTruthy();
			} finally {
				rmSync(siteDir, { recursive: true, force: true });
			}
		}
	);

	it(
		'should preserve a custom non-SQLite db.php when installing SQLite plugin on disk',
		{ timeout: 30_000 },
		async () => {
			const dbStubContent = readFileSync(
				join(__dirname, 'fixtures/mysql-db-stub.php'),
				'utf-8'
			);

			await using handler = await bootWordPressAndRequestHandler({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				wordPressZip: await getWordPressModule(),
				sqliteIntegrationPluginZip: await getSqliteDriverModule(),
				sqliteIntegrationPluginPath: 'mu-plugins',
				wordpressInstallMode: 'do-not-attempt-installing',
				hooks: {
					beforeDatabaseSetup: async (php) => {
						await php.mkdir('/wordpress/wp-content');
						await php.writeFile(
							'/wordpress/wp-content/db.php',
							dbStubContent
						);
					},
				},
			});

			const php = await handler.getPrimaryPhp();
			expect(
				await php.readFileAsText('/wordpress/wp-content/db.php')
			).toBe(dbStubContent);
			expect(
				await php.fileExists(
					'/wordpress/wp-content/mu-plugins/sqlite-database-integration/load.php'
				)
			).toBe(true);
		}
	);
});
