(function (scope) {
  'use strict';

  var nativeDevice = scope.RibitDevice;
  var pending = {};
  var nextRequest = 0;
  var database;

  function withDatabase(callback) {
    if (database) return callback(null, database);
    var request;
    try {
      request = scope.indexedDB.open('ribit', 1);
    } catch (error) {
      return callback(error);
    }
    request.onupgradeneeded = function () {
      request.result.createObjectStore('calculations', { keyPath: 'id' });
    };
    request.onsuccess = function () {
      database = request.result;
      database.onversionchange = function () { database.close(); database = null; };
      callback(null, database);
    };
    request.onerror = function () { callback(request.error); };
  }

  function newId() {
    var random = scope.crypto.getRandomValues(new Uint32Array(4));
    return Array.prototype.map.call(random, function (number) { return number.toString(16); }).join('-');
  }

  function browserRequest(method, data, callback) {
    withDatabase(function (error, db) {
      if (error) return callback(error);
      var request;
      var result;
      var write = method === 'save' || method === 'remove' || method === 'import';
      try {
        var tx = db.transaction('calculations', write ? 'readwrite' : 'readonly');
        var store = tx.objectStore('calculations');

        if (method === 'list') {
          result = [];
          request = store.openCursor();
          request.onsuccess = function () {
            var cursor = request.result;
            if (!cursor) return;
            var entry = cursor.value;
            result.push({ id: entry.id, title: entry.title, updatedAt: entry.updatedAt, planCount: entry.planCount });
            cursor.continue();
          };
        } else if (method === 'load') {
          request = store.get(data.id);
          request.onsuccess = function () { result = request.result || null; };
        } else if (method === 'save') {
          result = data.id || newId();
          store.put({
            id: result, title: data.title, updatedAt: Date.now(),
            planCount: data.calculation.plans.length, calculation: data.calculation
          });
        } else if (method === 'import') {
          data.entries.forEach(function (entry) {
            store.add({
              id: newId(), title: entry.title, updatedAt: entry.updatedAt,
              planCount: entry.calculation.plans.length, calculation: entry.calculation
            });
          });
        } else if (method === 'remove') {
          store.delete(data.id);
        } else {
          throw new Error('Unknown storage action');
        }

        tx.oncomplete = function () {
          if (method === 'list') result.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
          callback(null, result);
        };
        tx.onabort = function () { callback(tx.error || new Error('Storage unavailable')); };
      } catch (problem) {
        callback(problem);
      }
    });
  }

  function send(method, data, callback) {
    if (!nativeDevice) return browserRequest(method, data, callback);
    var id = String(++nextRequest);
    pending[id] = callback;
    try {
      nativeDevice.send(JSON.stringify({ id: id, method: method, data: data }));
    } catch (error) {
      delete pending[id];
      callback(error);
    }
  }

  scope.RibitStorage = {
    request: send,
    receive: function (id, response) {
      var callback = pending[id];
      if (!callback) return;
      delete pending[id];
      var payload = JSON.parse(response);
      callback(payload.ok ? null : new Error('Storage unavailable'), payload.result);
    }
  };
}(this));
