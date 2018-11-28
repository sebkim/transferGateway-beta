const admin = require("firebase-admin");
const serviceAccount = require("../../kerasiosdev-firebase-adminsdk-5k15q-bf25ba0ffc.json");
const Web3 = require('web3');
const BN = require('bn.js')
const program = require('commander')
const web3Http = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/G6jiWFDK2hiEfZVJG8w1'))
const assert = require('assert');
const CONST = require('../constants');

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
    databaseURL: "https://kerasiosdev.firebaseio.com"
});

const db = admin.firestore();
const settings = {/* your settings... */ timestampsInSnapshots: true};
db.settings(settings);


const coinMultiplier = new BN(10).pow(new BN(18))
program
  .command('withdraw <fromAccount> <to> <amount>')
  .description('withdraw with specific amount')
  .option("-u, --unit <unit>", "KRS unit (same as eth unit)")
  .action(async function(fromAccount, to, amount, options) {
    let unit = options.unit
    if(unit == null) {
        unit = 'wei'
    }
    assert(web3Http.utils.isAddress(to), "eth address must be valid!")

    // fromAccount validation check
    let myAccountDoc = await db.collection('balances').doc(fromAccount).get()
    if(!myAccountDoc.exists) {
        console.log(`balances/{fromAccount} does not exist!`)
        process.exit(1)
    }
    ///

    let toAddr = to.toLowerCase();
    let modiAmount = null
    try {
        modiAmount = web3Http.utils.toWei(amount, unit)
    } catch(e) {
        console.log("fromWei fail!")
        console.log(e.toString())
        program.exit(1)
    }
    
    console.log("Processing...")
    // db.collection('withdrawEvent')
    const balanceDocRef = db.collection('balances').doc(fromAccount)
    const withdrawEventRef = db.collection('withdrawEvent')
    try {
        await db.runTransaction(trans => {
            return trans.get(balanceDocRef).then(doc => {
                if(!doc.exists || doc.data() == null || doc.data().lock == null) {
                    let rejectMsg = `${toAddr}: cannot read balanceDocRef or lock field does not exist!`
                    return Promise.reject(rejectMsg)
                }
                if(doc.data().lock === true) {
                    let rejectMsg = `${toAddr}: current lock is true!`
                    return Promise.reject(rejectMsg)
                }
                let oldValue = new BN(doc.data().value)
                let newValue = oldValue.sub(new BN(modiAmount))
                if(newValue.isNeg()) {
                    let rejectMsg = `${toAddr}: newValue is negative!`
                    return Promise.reject(rejectMsg)
                } else {

                }
                trans.update(balanceDocRef, {
                    lock: true,
                    value: newValue.toString()
                })
                trans.set(withdrawEventRef.doc(), {
                    toAddr: toAddr,
                    fromAccount: fromAccount,
                    amount: modiAmount,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'unconfirmed'
                })
            })
        })
    } catch(e) {
        const errMsg = `in withdraw.js, transaction error ${e.toString()}`
        slackNoti(errMsg)
        console.log(errMsg)
    }
    console.log('done!')
    
  })

program
  .version('0.1.0')
  .parse(process.argv)

  