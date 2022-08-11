
const net = require('net');
const {ethers, Provider, Wallet, BigNumber, utils, Contract, constants} = require("ethers");
const axios = require("axios");


class WxBot {
    constructor() {
        this.server = net.createServer(socket => {
            socket.on('data', async buffer => {
                let msg = buffer.toString()
                let obj = JSON.parse(msg)
                if (this.msg_callback) {
                    let reply = await this.msg_callback(obj)
                    if (reply != null) {
                        let robj = {
                            to : obj.source,
                            content : reply
                        }
                        socket.write(JSON.stringify(robj))
                    }
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



const url = 'https://rpc.flashbots.net/'
const provider = new ethers.providers.JsonRpcProvider(url)

let bot = new WxBot()
bot.on_msg( async msg => {
    let text = msg.content
    let is_cmd = text.startsWith('/')
    let cmd = text.substr(1)
    console.log(is_cmd, cmd)
    if (is_cmd) {
        if (cmd == 'gas') {
            let gasPrice = await provider.getGasPrice()
            return Number(utils.formatUnits(gasPrice, "gwei")).toFixed(2) + ' gwei'
        } else if (cmd == 'menu') {
            return '/gas /<token>'
        }else {
            let {data} = await axios.get('https://min-api.cryptocompare.com/data/price?fsym='+cmd+'&tsyms=USD')
            return JSON.stringify(data)
        }
    }
    //return msg.content
})
bot.run()
let a = {
    d : 'aaa\nbbb'
}

console.log(JSON.stringify(a))
