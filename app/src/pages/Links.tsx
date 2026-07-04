import { ExternalLink, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Links — a curated resource hub of external charts and tools.
 * Story: "Jump to the market charts and calculators I use, from one place."
 * These open on their source sites (which host them live); Fathom links out
 * rather than embedding — none offer an embed/API and financial sites block
 * iframing.
 */
interface LinkItem {
  name: string
  desc: string
  url: string
  star?: boolean
}
interface Section {
  title: string
  note?: string
  links: LinkItem[]
}

const SECTIONS: Section[] = [
  {
    title: 'Calculators & tools',
    links: [
      {
        name: 'Qualtrim insights',
        desc: 'Dividend and fundamentals research',
        url: 'https://www.qualtrim.com/app/insights',
      },
      {
        name: 'Compound interest calculator',
        desc: 'NerdWallet — growth of savings over time',
        url: 'https://www.nerdwallet.com/banking/calculators/compound-interest-calculator',
      },
      {
        name: 'Amortization calculator',
        desc: 'Calculator.net — loan paydown schedules',
        url: 'https://www.calculator.net/amortization-calculator.html',
      },
      {
        name: 'Mortgage calculator',
        desc: 'Bankrate — payments, interest, and schedules',
        url: 'https://www.bankrate.com/mortgages/mortgage-calculator/',
      },
    ],
  },
  {
    title: 'Market charts',
    note: 'Live on Yardeni Research — updated regularly at the source.',
    links: [
      {
        name: 'Stock market P/E ratios',
        desc: 'Forward and trailing P/E for the S&P 500 and its history',
        url: 'https://www.yardeni.com/charts/us-stock-market/stock-market-valuation/stock-market-p-e-ratios',
        star: true,
      },
      {
        name: 'S&P 500 earnings & the economy',
        desc: 'Index earnings against GDP and the business cycle',
        url: 'https://www.yardeni.com/charts/us-stock-market/stock-market-fundamentals/sp-500-earnings-the-economy',
      },
      {
        name: 'S&P 500 sectors — forward metrics',
        desc: 'Forward earnings, revenue, and margin fundamentals by sector',
        url: 'https://www.yardeni.com/charts/us-stock-market/stock-market-forward-metrics/sp-500-sectors-forward-metrics-fundamentals',
      },
      {
        name: 'S&P 500 MegaCap-8',
        desc: 'The eight megacaps driving the index',
        url: 'https://www.yardeni.com/charts/domestic-industry-briefings/s-p-500-megacap-8/sp-500-megacap-8',
      },
      {
        name: 'US GDP',
        desc: 'Gross domestic product, real and nominal',
        url: 'https://www.yardeni.com/charts/us-economy/us-gross-domestic-product/gdp',
      },
      {
        name: 'US consumer confidence & sentiment',
        desc: 'Consumer confidence, sentiment, and optimism gauges',
        url: 'https://www.yardeni.com/charts/us-consumer/us-consumer-confidence/consumer-confidence-sentiment-optimism',
      },
    ],
  },
]

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function Links() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-10 text-3xl font-semibold tracking-tight">Links</h1>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-10">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
            {section.note && <p className="text-sm text-muted-foreground">{section.note}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Card className="h-full transition-colors group-hover:bg-surface-2">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 font-medium">
                        {link.star && <Star className="size-3.5 fill-primary text-primary" />}
                        {link.name}
                      </h3>
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{link.desc}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground/70">{domainOf(link.url)}</p>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
