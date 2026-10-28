import { resolve } from 'node:path'
import { finalizeAngularPackage } from './angular-package.mjs'

await finalizeAngularPackage(
  resolve(import.meta.dirname, '../packages/angular-charts'),
)
