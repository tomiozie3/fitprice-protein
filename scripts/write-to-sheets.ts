import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { google } from 'googleapis'
import type { ProductOffer } from '../src/types'

const ROOT = process.cwd()
const INPUT_PATH = process.env.PRODUCT_OFFERS_PATH ?? path.join(ROOT, 'data', 'product-offers.json')
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
const SHEET_NAME = process.env.GOOGLE_SHEETS_SHEET_NAME ?? 'ProductOffers'

const headers = [
  'productId',
  'offerId',
  'maker',
  'name',
  'proteinType',
  'sizeGrams',
  'expectedSizeGrams',
  'expectedFlavor',
  'expectedSku',
  'detectedSizeGrams',
  'detectedFlavor',
  'detectedSku',
  'imageUrl',
  'storeName',
  'storeType',
  'productUrl',
  'regularPriceYen',
  'salePriceYen',
  'couponDiscountYen',
  'shippingYen',
  'freeShippingMinYen',
  'effectivePriceYen',
  'pricePerKgYen',
  'pricePer3KgYen',
  'regularEffectivePriceYen',
  'regularPricePer3KgYen',
  'previousEffectivePriceYen',
  'priceDiffYen',
  'affiliateUrl',
  'hasSale',
  'hasCoupon',
  'couponLabel',
  'saleLabel',
  'discountRate',
  'inStock',
  'lastCheckedAt',
  'fetchStatus',
  'errorMessage',
  'lastSuccessfulPriceYen',
  'lastSuccessfulCheckedAt',
  'couponSource',
  'priceEvidence',
  'sourceType',
] as const

function getCredentialJson() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is required')
  return JSON.parse(raw)
}

async function main() {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is required')

  const offers = JSON.parse(await readFile(INPUT_PATH, 'utf8')) as ProductOffer[]
  const credentials = getCredentialJson()
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const sheetExists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === SHEET_NAME)
  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    })
  }

  const values = [
    headers,
    ...offers.map((offer) => headers.map((key) => {
      const value = offer[key]
      if (value === null || value === undefined) return ''
      return typeof value === 'boolean' ? String(value) : value
    })),
  ]

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  })

  console.log(`Wrote ${offers.length} offers to Google Sheets: ${SHEET_NAME}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
