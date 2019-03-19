const CONST = require('./constants');
const BN = require('bn.js')

const getSlackNoti = () => {
    var Slack = require('slack-node');
    const WEBHOOK_URI = CONST.WEBHOOK_URI;
    const slack = new Slack();
    slack.setWebhook(WEBHOOK_URI);

    const slackNoti = (text) => {
        slack.webhook({
            channel: "#ethwalletsync",
            username: "webhookbot",
            text: `${text}`
        }, function(err, response) {
            // console.log(response);
        });
    }
    return slackNoti;
}

function balanceFormatter(value, digits) {
    let depo = value
    if(typeof value === typeof 1) {
        depo = value.toFixed(0)
    }
    let whichMultiplier = (new BN(10)).pow(new BN(18 - digits))

    depo = (new BN(depo)).div(whichMultiplier)
    let firstPart = depo.toString().padStart(18 - digits, '0').slice(0, -digits)
    let secondPart = depo.toString().padStart(18 - digits, '0').slice(-digits)
    let modiFirstPart = ''
    let firstZeroIndi = false
    for(let char of firstPart) {
        if(char == 0 && firstZeroIndi === false) {

        } else {
            modiFirstPart = modiFirstPart.concat(char)
            firstZeroIndi = true
        }
    }
    if(modiFirstPart == '') modiFirstPart = '0'
    let depoStr = modiFirstPart + '.' + secondPart
    return depoStr
}

const httpType = "http"
const gqImageUrl = "https://s3.ap-northeast-2.amazonaws.com/kera-test/global/GQ-64px.png"

const addressMapperAddr = "0xB4A41538Fbb62433c0CCCA04Aa4B22b52bC09A0e"

module.exports = {
    getSlackNoti,
    httpType,
    gqImageUrl,
    addressMapperAddr,
    balanceFormatter
}