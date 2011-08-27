var http = require('http'),
    urlParser = require('url').parse,
    jsdom = require('jsdom');

module.exports = function(url, callback) {
  if (!callback) throw new Error('Callback is not specified'); 
  if (!url) return callback(new Error('URL is not specified'));

  var parsedUrl = urlParser(url);
  var options = {
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + (parsedUrl.search || ''),
    headers: {
      'User-Agent': 'shimizu.toshihiro@gmail.com'
    }
  };

  http.get(options, function(res) {
    if (res.statusCode !== 200) return callback(
      new Error('URL: ' + url + ', StatusCode: ' + res.statusCode), null);
    res.setEncoding('utf8');
    var buf = '';

    res.on('data', function(chunk) {
      buf += chunk;
    });

    res.on('end', function() {
      jsdom.env( {
        html: buf,
        scripts: ['http://code.jquery.com/jquery-1.6.2.min.js']
      }, function(err, window) {
        callback(null, window.jQuery);
      });
    });

    res.on('error', function(err) {
      callback(err, null);
    });
  });
};
