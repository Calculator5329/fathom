import { useState } from 'react'
import { ArrowUpRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const swatches = [
  { name: 'canvas', cls: 'bg-background' },
  { name: 'surface-1', cls: 'bg-surface-1' },
  { name: 'surface-2', cls: 'bg-surface-2' },
  { name: 'surface-3', cls: 'bg-surface-3' },
  { name: 'surface-4', cls: 'bg-surface-4' },
  { name: 'primary', cls: 'bg-primary' },
  { name: 'loss', cls: 'bg-loss' },
  { name: 'chart-2', cls: 'bg-chart-2' },
  { name: 'chart-3', cls: 'bg-chart-3' },
  { name: 'chart-4', cls: 'bg-chart-4' },
]

const metrics = [
  { label: 'Final value', value: '$87,432', sub: '+774% total return', gain: true },
  { label: 'CAGR', value: '12.4%', sub: '1993–2026', gain: true },
  { label: 'Max drawdown', value: '−33.7%', sub: 'Oct 2007 – Mar 2009', gain: false },
  { label: 'Sharpe ratio', value: '0.86', sub: 'vs 0.71 benchmark', gain: true },
]

const annualReturns = [
  { year: 2022, p1: -18.2, p2: -11.4, bench: -18.1 },
  { year: 2023, p1: 24.6, p2: 15.2, bench: 26.3 },
  { year: 2024, p1: 21.9, p2: 13.8, bench: 25.0 },
  { year: 2025, p1: 9.3, p2: 7.1, bench: 8.4 },
]

function Pct({ v }: { v: number }) {
  const sign = v > 0 ? '+' : ''
  return (
    <span className={`tnum ${v < 0 ? 'text-loss' : 'text-gain'}`}>
      {sign}
      {v.toFixed(1)}%
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-16 mb-6 text-2xl font-semibold tracking-tight">{children}</h2>
  )
}

export function Styleguide() {
  const [reinvest, setReinvest] = useState(true)

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-mono text-sm text-muted-foreground">fathom / styleguide</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Ledger Dark</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Near-black canvas with a green cast, four surface steps, hairline borders,
            one emerald accent. Body text never drops below 15px. Numbers are always
            tabular.
          </p>
        </div>
        <Badge variant="outline" className="font-mono">
          v0.1
        </Badge>
      </div>

      {/* Colors */}
      <SectionTitle>Color tokens</SectionTitle>
      <div className="grid grid-cols-5 gap-3">
        {swatches.map((s) => (
          <div key={s.name} className="space-y-2">
            <div className={`h-16 rounded-lg border ${s.cls}`} />
            <p className="font-mono text-sm text-muted-foreground">{s.name}</p>
          </div>
        ))}
      </div>

      {/* Typography */}
      <SectionTitle>Typography</SectionTitle>
      <Card>
        <CardContent className="space-y-5 pt-6">
          <p className="text-4xl font-semibold tracking-tight">Backtest any portfolio</p>
          <p className="text-2xl font-semibold tracking-tight">
            Growth of $10,000 · 1993–2026
          </p>
          <p className="text-base">
            Body text is Inter at 16px with 1.5 line height. It stays readable at a
            glance — no squinting at dense finance tables.
          </p>
          <p className="text-sm text-muted-foreground">
            Secondary text bottoms out at 15px. This is the smallest text on the site.
          </p>
          <p className="font-mono text-base tnum">
            VTI · 1993-01-29 → 2026-07-02 · $10,000.00 → $87,432.19
          </p>
        </CardContent>
      </Card>

      {/* Metric cards */}
      <SectionTitle>Metric cards</SectionTitle>
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {m.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-semibold tracking-tight tnum ${
                  m.gain ? '' : 'text-loss'
                }`}
              >
                {m.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{m.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Buttons */}
      <SectionTitle>Buttons</SectionTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Button>
          Run backtest
          <ArrowUpRight />
        </Button>
        <Button variant="secondary">Compare portfolio</Button>
        <Button variant="ghost">
          <Plus />
          Add ticker
        </Button>
        <Button variant="outline">
          <Copy />
          Copy link
        </Button>
        <Button variant="destructive">Remove</Button>
        <Button disabled>Running…</Button>
      </div>

      {/* Progressive disclosure */}
      <SectionTitle>Progressive disclosure</SectionTitle>
      <p className="mb-4 text-muted-foreground">
        Row actions stay hidden until the row is hovered or focused — controls appear
        when the user needs them.
      </p>
      <Card>
        <CardContent className="pt-6">
          {[
            { t: 'VTI', n: 'Vanguard Total Stock Market ETF', w: '60%', type: 'ETF' },
            { t: 'BND', n: 'Vanguard Total Bond Market ETF', w: '30%', type: 'ETF' },
            { t: 'VNQ', n: 'Vanguard Real Estate ETF', w: '10%', type: 'ETF' },
          ].map((row) => (
            <div
              key={row.t}
              className="group -mx-3 flex items-center gap-4 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="w-14 font-mono font-medium">{row.t}</span>
              <Badge variant="secondary">{row.type}</Badge>
              <span className="flex-1 truncate text-muted-foreground">{row.n}</span>
              <span className="font-mono tnum">{row.w}</span>
              <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="icon-sm" aria-label="Edit">
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove">
                  <Trash2 />
                </Button>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Form controls */}
      <SectionTitle>Form controls</SectionTitle>
      <Card>
        <CardContent className="grid grid-cols-3 gap-8 pt-6">
          <div className="space-y-2">
            <Label htmlFor="ticker">Add ticker</Label>
            <Input id="ticker" placeholder="e.g. VTI, AAPL, VTSAX" />
          </div>
          <div className="space-y-2">
            <Label>Rebalancing</Label>
            <Select defaultValue="annual">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="annual">Annually</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reinvest">Reinvest dividends</Label>
            <div className="flex h-9 items-center gap-3">
              <Switch id="reinvest" checked={reinvest} onCheckedChange={setReinvest} />
              <span className="text-sm text-muted-foreground">
                {reinvest ? 'On — total return' : 'Off — price return'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      <div className="mt-6 flex gap-2">
        <Badge>Stock</Badge>
        <Badge variant="secondary">ETF</Badge>
        <Badge variant="outline">Mutual fund</Badge>
        <Badge variant="destructive">Leveraged</Badge>
        <Badge variant="outline" className="border-chart-3 text-chart-3">
          Simulated
        </Badge>
      </div>

      {/* Tabs + table */}
      <SectionTitle>Results depth tabs</SectionTitle>
      <Tabs defaultValue="annual">
        <TabsList>
          <TabsTrigger value="annual">Annual returns</TabsTrigger>
          <TabsTrigger value="rolling">Rolling returns</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
        </TabsList>
        <TabsContent value="annual" className="animate-enter">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Portfolio 1</TableHead>
                    <TableHead className="text-right">Portfolio 2</TableHead>
                    <TableHead className="text-right">Benchmark (SPY)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {annualReturns.map((r) => (
                    <TableRow key={r.year}>
                      <TableCell className="font-mono tnum">{r.year}</TableCell>
                      <TableCell className="text-right font-mono">
                        <Pct v={r.p1} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <Pct v={r.p2} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <Pct v={r.bench} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rolling" className="animate-enter">
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Rolling 1/3/5/10-year return charts land here.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="risk" className="animate-enter">
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Sortino, best/worst year, correlation matrix.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="income" className="animate-enter">
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Dividend history and yield-on-cost over time.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator className="my-16" />
      <p className="text-sm text-muted-foreground">
        Fathom · Ledger Dark styleguide · every token above is a CSS variable in{' '}
        <span className="font-mono">src/index.css</span>
      </p>
    </div>
  )
}
