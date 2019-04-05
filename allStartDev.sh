#!/bin/bash
pm2 start ./js/deposit/logScan.js --name logScan_dev
pm2 start ./js/deposit/confirmCheck.js --name confirmCheck_dev
pm2 start ./js/deposit/balanceUpdate.js --name balanceUpdate_dev
pm2 start ./js/deposit/unconfirmedDepositWatcher.js --name unconfirmedDepositWatcher_dev

pm2 start ./js/withdraw/withdrawTxTrigger.js --name withdrawTxTrigger_dev
pm2 start ./js/withdraw/withdrawLogScan.js --name withdrawLogScan_dev
pm2 start ./js/withdraw/unconfirmedWithdrawWatcher.js --name unconfirmedWithdrawWatcher_dev

pm2 start ./js/walConTransWatcher.js --name walConTransWatcher_dev
