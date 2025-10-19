// Monaco Editor Loader for Webview
// This script loads Monaco Editor dynamically

(function() {
    // Create a script element to load Monaco from CDN
    const loaderScript = document.createElement('script');
    loaderScript.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
    loaderScript.async = true;
    
    loaderScript.onload = function() {
        require.config({ 
            paths: { 
                'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' 
            }
        });
        
        require(['vs/editor/editor.main'], function() {
            // Monaco is loaded, dispatch event
            window.dispatchEvent(new Event('monaco-loaded'));
        });
    };
    
    loaderScript.onerror = function() {
        console.error('Failed to load Monaco Editor');
        vscodeApi.postMessage({
            type: 'log',
            content: 'Failed to load Monaco Editor from CDN'
        });
    };
    
    document.head.appendChild(loaderScript);
})();

