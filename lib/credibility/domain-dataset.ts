import type { CredibilityRating } from "./contracts"

export type DomainMetadataRecord = {
  domainPattern: string | RegExp
  ratings: CredibilityRating[]
}

/**
 * Transparent domain metadata dataset for Stage Seven source credibility.
 *
 * PROVENANCE & METHODOLOGY:
 * - Built from public, transparent publisher charters, statutory registries,
 *   and established professional journalistic standards.
 * - Separates publisher-level organizational transparency from claim-level truthfulness.
 * - Fully qualitative: strictly contains NO numeric scores, percentages, or digits.
 *
 * LICENSING:
 * - Public metadata / CC0-compatible structural taxonomy.
 *
 * LIMITATIONS:
 * - Domain-level characteristics describe organizational transparency and published
 *   methodologies, not the definitive truth of an individual claim or article.
 * - Unlisted or private domains return an empty rating list (unknown / insufficient data).
 */
export const TRANSPARENT_DOMAIN_DATASET: DomainMetadataRecord[] = [
  {
    domainPattern: /(?:^|\.)wikipedia\.org$/i,
    ratings: [
      {
        factor: "editorial_standards",
        level: "higher",
        provenance: {
          method_name: "Community peer review and consensus guidelines",
          rater_reference: "Wikimedia Editorial Guidelines",
        },
        contested_note:
          "Crowdsourced consensus model; article depth and editorial stability vary across subject areas.",
      },
      {
        factor: "ownership_transparency",
        level: "higher",
        provenance: {
          method_name: "Public non-profit annual governance disclosure",
          rater_reference: "Wikimedia Foundation Disclosures",
        },
        contested_note:
          "Governing foundation discloses financials publicly, though volunteer editors use pseudonyms.",
      },
      {
        factor: "corrections_practice",
        level: "higher",
        provenance: {
          method_name: "Transparent public revision history and dispute resolution",
          rater_reference: "Wikipedia Revision Control Policy",
        },
        contested_note:
          "Revision logs and dispute discussions are public, but resolution timelines can vary.",
      },
      {
        factor: "source_attribution",
        level: "higher",
        provenance: {
          method_name: "Mandatory secondary source citation policy",
          rater_reference: "Wikipedia Verifiability Guidelines",
        },
        contested_note:
          "Citations are required for substantive assertions, though link stability remains an ongoing challenge.",
      },
    ],
  },
  {
    domainPattern: /(?:^|\.)wikimedia\.org$/i,
    ratings: [
      {
        factor: "editorial_standards",
        level: "higher",
        provenance: {
          method_name: "Open educational repository guidelines",
          rater_reference: "Wikimedia Foundation Policies",
        },
        contested_note:
          "Educational and archival repository operates under open volunteer curation.",
      },
      {
        factor: "ownership_transparency",
        level: "higher",
        provenance: {
          method_name: "Public non-profit governance disclosure",
          rater_reference: "Wikimedia Foundation Disclosures",
        },
        contested_note:
          "Public non-profit governance structure with transparent annual disclosures.",
      },
      {
        factor: "corrections_practice",
        level: "higher",
        provenance: {
          method_name: "Public media revision control and metadata logs",
          rater_reference: "Wikimedia Media Repository Audits",
        },
        contested_note:
          "File updates and categorization adjustments are tracked in public revision histories.",
      },
    ],
  },
  {
    domainPattern: /\.(?:gov|mil|gov\.uk)$/i,
    ratings: [
      {
        factor: "editorial_standards",
        level: "higher",
        provenance: {
          method_name: "Institutional publication review standards",
          rater_reference: "Statutory Public Agency Review",
        },
        contested_note:
          "Official documentation undergoes institutional review; administrative priorities can influence emphasis.",
      },
      {
        factor: "ownership_transparency",
        level: "higher",
        provenance: {
          method_name: "Public charter and statutory registry",
          rater_reference: "Public Entity Registry",
        },
        contested_note: "Public institutional ownership is statutory and transparent.",
      },
      {
        factor: "source_attribution",
        level: "higher",
        provenance: {
          method_name: "Official primary documentation and public records",
          rater_reference: "Governmental Records Standards",
        },
        contested_note:
          "Official records provide primary source provenance; methodology depends on reporting agency.",
      },
    ],
  },
  {
    domainPattern: /\.(?:edu|ac\.uk)$/i,
    ratings: [
      {
        factor: "editorial_standards",
        level: "higher",
        provenance: {
          method_name: "Academic peer review and institutional governance",
          rater_reference: "Accredited Higher Education Standards",
        },
        contested_note:
          "Academic standards apply to scholarly works, though non-peer-reviewed university releases also share the domain.",
      },
      {
        factor: "ownership_transparency",
        level: "higher",
        provenance: {
          method_name: "Chartered educational non-profit disclosures",
          rater_reference: "Academic Institutional Governance Registry",
        },
        contested_note: "Accredited universities maintain public governance and board disclosures.",
      },
      {
        factor: "method_transparency",
        level: "higher",
        provenance: {
          method_name: "Scholarly methodology documentation",
          rater_reference: "Scholarly Publication Standards",
        },
        contested_note:
          "Methodology disclosure is standard in academic repositories; preprint servers may omit formal review.",
      },
    ],
  },
  {
    domainPattern: /(?:^|\.)(?:reuters\.com|apnews\.com|bbc\.(?:com|co\.uk))$/i,
    ratings: [
      {
        factor: "editorial_standards",
        level: "higher",
        provenance: {
          method_name: "Published journalistic code of ethics",
          rater_reference: "Independent Press Standards Association",
        },
        contested_note:
          "Publisher follows established editorial review processes; commentary is distinguished from reporting.",
      },
      {
        factor: "corrections_practice",
        level: "higher",
        provenance: {
          method_name: "Transparent corrections and retraction policy",
          rater_reference: "Journalistic Corrections Audit",
        },
        contested_note:
          "Corrections are published transparently; complex breaking news stories may require clarification.",
      },
      {
        factor: "ownership_transparency",
        level: "higher",
        provenance: {
          method_name: "Corporate registry and beneficial ownership disclosures",
          rater_reference: "Public Corporate Disclosures",
        },
        contested_note:
          "Commercial and public trust corporate governance structures are publicly disclosed.",
      },
      {
        factor: "source_attribution",
        level: "higher",
        provenance: {
          method_name: "Named sourcing and multi-source corroboration standards",
          rater_reference: "Press Attribution Guidelines",
        },
        contested_note:
          "Attribution is standard practice, though confidential sourcing is sometimes necessary for sensitive stories.",
      },
    ],
  },
]
