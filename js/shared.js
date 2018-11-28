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

module.exports = {
    getSlackNoti
}