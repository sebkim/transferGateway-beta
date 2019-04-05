#!/bin/bash
pm2 start ./js/deposit/logScan.js --name logScan_prod
pm2 start ./js/deposit/confirmCheck.js --name confirmCheck_prod
pm2 start ./js/deposit/balanceUpdate.js --name balanceUpdate_prod
pm2 start ./js/deposit/unconfirmedDepositWatcher.js --name unconfirmedDepositWatcher_prod

pm2 start ./js/withdraw/withdrawTxTrigger.js --name withdrawTxTrigger_prod
pm2 start ./js/withdrawLogScan.js --name withdrawLogScan_prod
pm2 start ./js/unconfirmedWithdrawWatcher.js --name unconfirmedWithdrawWatcher_prod

pm2 start ./js/walConTransWatcher.js --name walConTransWatcher_prod
