import { foo } from '../domain/foo.js'

export function importFoo(): number {
  return foo() + 1
}
