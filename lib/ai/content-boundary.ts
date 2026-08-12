export const SOURCE_OPEN = "<<<SOURCE>>>"
export const SOURCE_CLOSE = "<<<END>>>"

export type WrappedSource = {
  block: string
  escapedSource: string
  collisionCount: number
}

export function escapeSourceDelimiters(source: string): Omit<WrappedSource, "block"> {
  let collisionCount = 0
  const escapedSource = source.replace(/<<<(?:SOURCE|END)>>>/g, (delimiter) => {
    collisionCount += 1
    return `＜${delimiter.slice(1)}`
  })
  return { escapedSource, collisionCount }
}

export function wrapUntrustedSource(source: string): WrappedSource {
  const escaped = escapeSourceDelimiters(source)
  return {
    ...escaped,
    block: `${SOURCE_OPEN}\n${escaped.escapedSource}\n${SOURCE_CLOSE}`,
  }
}
