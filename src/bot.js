
const net = require('net');

const server = net.createServer(socket => {
    socket.on('data', buffer => {
        console.log(buffer.toString())
    });
})

let b = Buffer.from('你好')
console.log(b)

let msg = {
    to : 'filehelper',
    content : '{"usd": 1220}'
}

console.log(JSON.stringify(msg))

//server.listen(1224)
