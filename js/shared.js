const CONST = require('./constants');

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

const httpType = "http"
const gqImageUrl = "https://s3.ap-northeast-2.amazonaws.com/kera-test/global/GQ-64px.png"

const addressMapperAddr = "0xB4A41538Fbb62433c0CCCA04Aa4B22b52bC09A0e"

module.exports = {
    getSlackNoti,
    httpType,
    gqImageUrl,
    addressMapperAddr
}