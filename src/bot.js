
const net = require('net');


class WxBot {
    constructor() {
        this.server = net.createServer(socket => {
            socket.on('data', async buffer => {
                let msg = buffer.toString()
                let obj = JSON.parse(msg)
                if (this.msg_callback) {
                    let reply = await this.msg_callback(obj)
                    let robj = {
                        to : obj.source,
                        content : reply
                    }
                    socket.write(JSON.stringify(robj))
                }
            });
        })
    }
    on_msg(fn) {
        this.msg_callback = fn
    }
    async run() {
        this.server.listen(1224)
    }
}

let bot = new WxBot()
bot.on_msg( async msg => {
    return msg.content
})
bot.run()
