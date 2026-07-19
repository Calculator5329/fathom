export const SCHWAB_POSITIONS_CSV = [
  'Symbol,Description,Quantity,Price,Market Value,Position As Of',
  'AAPL,APPLE INC,12,188.12,2257.44,01/15/2026',
  'MSFT,MICROSOFT CORP,5,430.77,2153.85,01/15/2026',
  'Subtotal, , , , ,',
].join('\n')

export const SCHWAB_ACTIVITY_CSV = [
  'Trade Date,Transaction Type,Symbol,Description,Quantity,Price,Net Amount,Commission,Fees',
  '01/05/2026,Buy,TSLA,TESLA INC,10,150.00,1500.00,2.95,0.00',
  '01/07/2026,Sell,TSLA,TESLA INC,-3,160.00,-480.00,3.10,0.00',
  '01/10/2026,ACH Deposit, , , , ,1250.00,,',
  '01/12/2026,ACH Withdrawal, , , , ,-450.00,,',
  '01/15/2026,Summary,End of transactions,,,,',
  '01/20/2026,Dividend Received,NVDA,NVIDIA CORP,0,0,22.50,0,0',
].join('\n')

export const VANGUARD_POSITIONS_CSV = [
  'Fund Symbol,Fund Name,Shares Held,Share Price,Market Value,Position As Of',
  'VOO,VANGUARD S&P 500 ETF,8,450.20,3601.60,01/14/2026',
  'BND,VANGUARD TOTAL BOND MARKET ETF,12,73.55,882.60,01/14/2026',
].join('\n')

export const VANGUARD_ACTIVITY_CSV = [
  'Transaction Date,Transaction Type,Fund Symbol,Transaction Description,Quantity,Price Paid,Net Amount',
  '2026-01-02,Buy,VOO,VANGUARD S&P 500 ETF,10,450.50,4505.00',
  '2026-01-12,Sell,VOO,VANGUARD S&P 500 ETF,-4,452.00,-1808.00',
  '2026-01-20,Dividend,VTI,VANGUARD TOTAL STOCK MARKET ETF,0,0.00,12.50',
  '2026-01-22,Foreign Tax Paid,VTI,VANGUARD TOTAL STOCK MARKET ETF,0,0,-1.10',
  '2026-01-23,Contribution, , ,0,0,1000.00',
  '2026-01-24,Withdrawal, , ,0,0,-250.00',
  '2026-01-25,Other Transaction, , ,0,0,',
].join('\n')
