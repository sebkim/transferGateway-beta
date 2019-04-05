#!/bin/bash
pm2 restart logScan_prod
pm2 restart confirmCheck_prod
pm2 restart balanceUpdate_prod
pm2 restart unconfirmedDepositWatcher_prod

pm2 restart withdrawTxTrigger_prod
pm2 restart withdrawLogScan_prod
pm2 restart unconfirmedWithdrawWatcher_prod

pm2 restart walConTransWatcher_prod

