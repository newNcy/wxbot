from socketserver import BaseRequestHandler, TCPServer
import json

class Bot(BaseRequestHandler):
    def __init__():
        s = TCPServer(('', 1224), Bot)
    def on_msg(self, fn):
        self.msg_callback = fn

    async def handle(self):
        print('attach to ', self.client_address)
        while True:
            msg = self.request.recv(8192)
            if (msg):
                o = json.loads(msg)
                source = o['source']
                if self.msg_callback:
                    reply = await self.msg_callback(msg)
                    ro = {'to':source, 'content':reply}
                    self.request.send(json.dumps(ro))
    def run(self):
        self.serve_forever();




async def handle_msg(msg):
    provider = Web3(Web3.HTTPProvider('https://rpc.flashbots.net/'))
    text = msg['content']
    is_cmd = text.startswith('/')
    cmd = text[1:]

    if is_cmd:
        if cmd == 'gas':
            return '' + int(provider.eth.gas_price/Web3.toWei(1,'gwei')) + ' gwei'
        else:
            ts = cmd.slipt(' ')
            s = ts[0]
            t = 'usd'
            if ts.length > 1: 
                t = ts[1]
            out = requests.get('https://min-api.cryptocompare.com/data/price?fsym='+s+'&tsyms='+t+'').text
            r = json.loads(out)
            if r.__contains__('Response'):
                out = '傻逼'
            else:
                p = r[t.upper()]
                out = '1 ' + s +' = '+p+' '+t
            return out


if __name__ == '__main__':
    bot = Bot()
    bot.on_msg(handle_msg)
