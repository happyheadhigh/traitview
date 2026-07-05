/* Lazy loader for TraitView download helpers.
   Classic script on purpose so inline handlers keep using global functions. */
(function(){
  var DOWNLOAD_SCRIPT_SRC = './js/downloads.js';
  var DOWNLOAD_GLOBALS = ['downloadTokenPng', 'downloadShareCardPng', 'downloadTokenSvg'];
  var downloadLoadPromise = null;
  var wrappers = {};

  function isRealDownloadFunction(name){
    return typeof window[name] === 'function' && window[name] !== wrappers[name];
  }

  function reportDownloadLoadError(err){
    if(err && err.__traitViewDownloadLoadAlerted) return;
    if(err) err.__traitViewDownloadLoadAlerted = true;
    console.error('TraitView download helpers failed to load:', err);
    alert('Download tools failed to load. Please refresh and try again.');
  }

  function loadTraitViewDownloads(){
    if(DOWNLOAD_GLOBALS.every(isRealDownloadFunction)) return Promise.resolve();
    if(downloadLoadPromise) return downloadLoadPromise;

    downloadLoadPromise = new Promise(function(resolve, reject){
      var script = document.createElement('script');
      script.src = DOWNLOAD_SCRIPT_SRC;
      script.async = false;
      script.onload = function(){
        var missing = DOWNLOAD_GLOBALS.filter(function(name){ return !isRealDownloadFunction(name); });
        if(missing.length){
          reject(new Error('TraitView download helpers missing: ' + missing.join(', ')));
          return;
        }
        resolve();
      };
      script.onerror = function(){
        reject(new Error('Unable to load ' + DOWNLOAD_SCRIPT_SRC));
      };
      document.head.appendChild(script);
    }).catch(function(err){
      downloadLoadPromise = null;
      reportDownloadLoadError(err);
      throw err;
    });

    return downloadLoadPromise;
  }

  function callDownloadAfterLoad(name, args){
    return loadTraitViewDownloads().then(function(){
      var fn = window[name];
      if(typeof fn !== 'function' || fn === wrappers[name]){
        throw new Error('TraitView download helper unavailable: ' + name);
      }
      return fn.apply(window, args);
    });
  }

  DOWNLOAD_GLOBALS.forEach(function(name){
    wrappers[name] = function(){
      return callDownloadAfterLoad(name, arguments);
    };
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value: wrappers[name]
    });
  });

  window.ensureTraitViewDownloadsLoaded = loadTraitViewDownloads;
})();
