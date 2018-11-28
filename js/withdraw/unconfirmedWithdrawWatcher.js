const admin = require("firebase-admin");
const serviceAccount = require("../../kerasiosdev-firebase-adminsdk-5k15q-bf25ba0ffc.json");
const Web3 = require('web3');
const BN = require('bn.js')
const moment = require('moment');
const CONST = require('../constants');

const getSlackNoti = require('../shared').getSlackNoti
const slackNoti = getSlackNoti()

const ercAddress = CONST.ercAddress
// almost # of blocks that corresponsds to 24 hours
const safeFromBlockGuard = CONST.safeFromBlockGuard

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kerasiosdev.firebaseio.com"
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);

const main = async () => {
    const intervalFunc = async () => {
        let nowD = moment().utc()
        let dSomeAgo = moment(nowD)
        dSomeAgo.subtract(2, 'hours')
        // dSomeAgo.subtract(2, 'minutes')
        // dSomeAgo.subtract(0, 'minutes')

        db.collection('withdrawEvent').where('status', '==', 'unconfirmed').where('createdAt', '<', dSomeAgo.toDate()).get()
        .then(snap => {
            snap.forEach(doc => {
                let errMsg = `in unconfirmedWithdrawWatcher.js, ${nowD.toDate()}, docID(${doc.id}): unconfirmed too long!`
                slackNoti(errMsg)
                console.log(errMsg)
            })
        })

        db.collection('withdrawEvent').where('status', '==', 'waitForLog').where('createdAt', '<', dSomeAgo.toDate()).get()
        .then(snap => {
            snap.forEach(doc => {
                let errMsg = `in unconfirmedWithdrawWatcher.js, ${nowD.toDate()}, docID(${doc.id}): waitForLog too long!`
                slackNoti(errMsg)
                console.log(errMsg)
            })
        })
    }
    const mainIterval = setInterval(intervalFunc, 1000 * 60 * 60) // 1 hour
    // const mainIterval = setInterval(intervalFunc, 1000 * 15)
    // intervalFunc()

}

main()