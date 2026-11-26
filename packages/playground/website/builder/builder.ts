import { buildBlueprintEditorRedirectUrl } from '../src/lib/state/url/blueprint-editor-query';

window.location.replace(buildBlueprintEditorRedirectUrl(window.location.href));
