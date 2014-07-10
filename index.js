var path = require('path'),
    express = require('express');

var app = express();

app.use(express.static(path.join(__dirname, 'public')));

var port = 8080;
app.listen(port);
console.log('Listening on port ' + port + '...');
