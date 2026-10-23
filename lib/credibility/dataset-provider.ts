import "server-only"

import type {
  CredibilityLookupRequest,
  CredibilityProvider,
  CredibilityProviderOutput,
} from "./contracts"
import { TRANSPARENT_DOMAIN_DATASET, type DomainMetadataRecord } from "./domain-dataset"
import { CredibilityProviderError } from "./http-provider"
import { credibilityLookupRequestSchema, validateCredibilityProviderOutput } from "./validation"

export type DatasetCredibilityProviderOptions = {
  dataset?: DomainMetadataRecord[]
}

export class DatasetCredibilityProvider implements CredibilityProvider {
  private readonly dataset: DomainMetadataRecord[]

  constructor(options: DatasetCredibilityProviderOptions = {}) {
    this.dataset = options.dataset ?? TRANSPARENT_DOMAIN_DATASET
  }

  async assess(
    request: CredibilityLookupRequest,
    signal?: AbortSignal,
  ): Promise<CredibilityProviderOutput> {
    if (signal?.aborted) {
      throw new CredibilityProviderError(
        "CREDIBILITY_PROVIDER_ABORTED",
        "Credibility lookup was interrupted.",
        true,
      )
    }

    const parsed = credibilityLookupRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new CredibilityProviderError(
        "CREDIBILITY_REQUEST_INVALID",
        "Credibility lookup requires a valid HTTPS source URL.",
        false,
        parsed.error,
      )
    }

    let hostname: string
    try {
      const url = new URL(parsed.data.source_url)
      hostname = url.hostname.toLowerCase()
    } catch (error) {
      throw new CredibilityProviderError(
        "CREDIBILITY_REQUEST_INVALID",
        "Invalid source URL provided for credibility lookup.",
        false,
        error,
      )
    }

    for (const record of this.dataset) {
      let matches = false
      if (typeof record.domainPattern === "string") {
        matches =
          hostname === record.domainPattern.toLowerCase() ||
          hostname.endsWith(`.${record.domainPattern.toLowerCase()}`)
      } else {
        matches = record.domainPattern.test(hostname)
      }

      if (matches) {
        return validateCredibilityProviderOutput({ ratings: record.ratings })
      }
    }

    // Unlisted or unknown domain: return empty ratings representing insufficient data / unrated
    return validateCredibilityProviderOutput({ ratings: [] })
  }
}
