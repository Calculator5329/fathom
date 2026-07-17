export const SCHWAB_POSITIONS_CSV = [
  'Symbol,Description,Quantity,Price,Market Value,Position As Of',
  'AAPL,Apple Inc,12,188.12,2257.44,2026-01-15',
  'MSFT,Microsoft Corp,5,430.77,2153.85,2026-01-15',
  'Subtotal,for all positions,,,',
].join('\n')

export const SCHWAB_ACTIVITY_CSV = [
  'Trade Date,Transaction Type,Symbol,Description,Quantity,Price,Net Amount',
  '01/05/2026,Buy,TSLA,Tesla Inc,10,150.00,1500',
  '01/07/2026,Sell,TSLA,Tesla Inc,-3,160.00,-480',
  '01/10/2026,ACH Deposit (Cash),,, , ,1250',
  '01/12/2026,ACH Withdrawal (Cash),,, , , -450',
  '01/15/2026,Summary,End of transactions,,,,',
  '01/20/2026,Dividend Received,NVDA,NVIDIA Corp,0.5,0,22.50',
].join('\n')

export const VANGUARD_POSITIONS_CSV = [
  'Fund Symbol,Fund Name,Shares Held,Price,Position As Of',
  'VOO,Vanguard S&P 500 ETF,8,450.20,2026-01-14',
  'BND,Vanguard Total Bond Market ETF,12,73.55,2026-01-14',
].join('\n')

export const VANGUARD_ACTIVITY_CSV = [
  'Transaction Date,Transaction Type,Fund Symbol,Transaction Description,Quantity,Price,Net Amount',
  '2026-01-02,Buy,VOO,Vanguard S&P 500 ETF,10,450.50,4505.00',
  '2026-01-12,Sell,VOO,Vanguard S&P 500 ETF,-4,452.00,-1808.00',
  '2026-01-20,Dividend,VTI,Vanguard Total Stock Market ETF,0,0,12.50',
  '2026-01-22,Foreign Tax Paid,VTI,Vanguard Total Stock Market ETF,0,0,-1.10',
  '2026-01-23,Contribution,,,,,1000',
  '2026-01-24,Withdrawal,,,,,-250',
  '2026-01-25,Other Transaction,,,,',
].join('\n')
