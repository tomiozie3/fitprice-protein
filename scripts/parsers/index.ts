import type { ProductSource } from '../../src/types'
import { genericParser, type StoreParser } from './generic'
import { myproteinParser } from './myprotein'
import { shopifyParser } from './shopify'
import { valxParser } from './valx'
import { xplosionParser } from './xplosion'

const parserByMaker: Record<string, StoreParser> = {
  myprotein: myproteinParser,
  'x-plosion': xplosionParser,
  xplosion: xplosionParser,
  valx: valxParser,
  grong: shopifyParser,
  lyft: shopifyParser,
}

function normalizeMaker(maker: string) {
  return maker.trim().toLowerCase()
}

export function getParser(source: ProductSource): StoreParser {
  return parserByMaker[normalizeMaker(source.maker)] ?? genericParser
}

export type { ExtractedPrice, ParsedProduct, ParserContext, StoreParser } from './generic'
