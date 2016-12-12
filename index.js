var fs = require("fs");
var Q = require("q");
var _ = require("lodash");
var os = require("os");
var path = require('path');
var mkdirParents = require('mkdir-parents');
var hash = require('string-hash')

var storage = {};

function cache(func, options) {
    var defaults = {
        tmpDir: os.tmpdir(),
        useMemoryCache: true,
        useFileCache: true,
        serializer: JSON.stringify,
        unserializer: JSON.parse,
        hasher: hash,
        tmpPrefix: "function-cache",
        updateCache: false
    };

    _.assignIn(defaults, options);
    options = defaults;

    // A hash is computed for the function to invalidate the hashing if it changes.
    var funcHash = options.hasher(func.toString());

    var funcWrapper = function() {
        if (!options.useMemoryCache && !options.useFileCache) return func;

        var args = _.toArray(arguments);
        var serializedArgs = options.serializer(args);
        var hash = options.hasher(funcHash + serializedArgs);
        var p = (options.useFileCache ? options.tmpDir + path.sep + options.tmpPrefix + hash : null);

        if (!options.updateCache && options.useMemoryCache && storage[hash] !== undefined) {
            // Already in RAM storage
            return Q(storage[hash]);
        }

        function callFunc(cb) {
            return Q(func.apply(this, args))
                .then(function(result) {
                    if (options.useMemoryCache) storage[hash] = result;
                    if (options.useFileCache) {
                        var dir = path.dirname(p);
                        // Create folder if it does not exist
                        mkdirParents(dir, 0o777, function (err) {
                            if (err) throw new Error(err);
                            fs.writeFile(p, options.serializer(result), function(err) {
                                if(err) throw new Error(err);
                                if (cb) cb()
                            });
                        });
                    }

                    return result;
                });
        }

        if (options.useFileCache) {
            return Q()
                .then(function() {
                    // We check if the cached file exists.
                    var prom = Promise.resolve()
                    if (options.updateCache) {
                        prom = new Promise((resolve) => callFunc(resolve))
                    }
                    return prom.then(() => Q.nfcall(fs.readFile, p, "UTF-8"));
                })
                .then(function(serializedData) {
                    // Cache is available
                    var data = options.unserializer(serializedData);
                    if(options.useMemoryCache) storage[hash] = data;
                    return data;
                },
                function(err) {
                    // Cache not available.
                    return callFunc();
                });
        }

        return callFunc();
    };

    return funcWrapper;
}

module.exports = cache;