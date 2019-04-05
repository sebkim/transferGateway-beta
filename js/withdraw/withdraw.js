const admin = require("firebase-admin");
const CONST = require('../constants');
const serviceAccount = require(`../../${CONST.ServiceAccountJSON}`);
const Web3 = require('web3');
const BN = require('bn.js')
const program = require('commander')
const assert = require('assert');
const web3Http = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${CONST.INFURA_KEY}`))

const getSlackNoti = require('../shared').getSlackNoti
const slackNoti = getSlackNoti()

// // error
// const { GetNullTrxError, FailGetConfirmationsError, TrxStatusFalseError } = require('../ErrorClasses');
// ///

const ercAddress = CONST.ercAddress
// almost # of blocks that corresponsds to 24 hours
const safeFromBlockGuard = CONST.safeFromBlockGuard

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: CONST.FbDatabaseURL
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);


const coinMultiplier = new BN(10).pow(new BN(18))
const sleep = (ms) => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms)
    })
}
program
  .command('withdraw <fromAccount> <to> <amount>')
  .description('withdraw with specific amount')
  .option("-u, --unit <unit>", "KRS unit (same as eth unit)")
  .action(async function(fromAccount, to, amount, options) {
    let unit = options.unit
    if(unit == null) {
        unit = 'wei'
    }

    // fromAccount validation check
    let myAccountDoc = await db.collection('balances').doc(fromAccount).get()
    if(!myAccountDoc.exists) {
        let errMsg = `balances/${fromAccount} does not exist!`
        console.log(errMsg)
        slackNoti(errMsg)
        await sleep(5000)
        process.exit(1)
    }
    ///

    let toAddr = to.toLowerCase();
    let modiAmount = null
    try {
        modiAmount = web3Http.utils.toWei(amount, unit)
    } catch(e) {
        let errMsg = `fromWei fail! ${e.toString()}`
        console.log(errMsg)
        slackNoti(errMsg)
        await sleep(5000)
        process.exit(1)
    }

    if(!web3Http.utils.isAddress(toAddr)) {
        let errMsg = `toAddr: ${toAddr} address is invalid!`
        console.log(errMsg)
        slackNoti(errMsg)
        await sleep(5000)
        process.exit(1)
    }

    console.log("Processing...")
    const balanceDocRef = db.collection('balances').doc(fromAccount)
    const withdrawEventRef = db.collection('withdrawEvent')
    try {
        await db.runTransaction(trans => {
            return trans.get(balanceDocRef).then(doc => {
                if(!doc.exists || doc.data() == null || doc.data().lock == null) {
                    let rejectMsg = `${fromAccount}: ${toAddr}: ${modiAmount}: cannot read balanceDocRef or lock field does not exist!`
                    return Promise.reject(rejectMsg)
                }
                if(doc.data().lock === true) {
                    let rejectMsg = `${fromAccount}: ${toAddr}: ${modiAmount}: current lock is true!`
                    return Promise.reject(rejectMsg)
                }
                let oldValue = new BN(doc.data().value)
                let newValue = oldValue.sub(new BN(modiAmount))
                if(newValue.isNeg()) {
                    let rejectMsg = `${fromAccount}: ${toAddr}: ${modiAmount}: newValue is negative!`
                    return Promise.reject(rejectMsg)
                } else {

                }
                let oldRecent = doc.data().recentWithdrawAddrs
                if(oldRecent == null) oldRecent = []
                let newRecent = oldRecent.slice()
                if((new Set(oldRecent)).has(toAddr)) {
                } else {
                    newRecent.push(toAddr)
                }
                trans.update(balanceDocRef, {
                    lock: true,
                    value: newValue.toString(),
                    recentWithdrawAddrs: newRecent
                })
                trans.set(withdrawEventRef.doc(), {
                    toAddr: toAddr,
                    fromAccount: fromAccount,
                    amount: modiAmount,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'unconfirmed',
                    prevAllBalance: oldValue.toString()
                })
            })
        })
    } catch(e) {
        const errMsg = `in withdraw.js, transaction error ${e.toString()}`
        slackNoti(errMsg)
        console.log(errMsg)
        await sleep(5000)
        process.exit(1)
    }
    console.log('done!')
    
  })

program
  .version('0.1.0')
  .parse(process.argv)

  