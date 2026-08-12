const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value: string, label: string): string {
  if (!uuidPattern.test(value)) throw new TypeError(`${label} must be a UUID`)
  return value.toLowerCase()
}

export function reportArtifactKey(ownerId: string, analysisId: string, exportId: string): string {
  return `artifacts/${uuid(ownerId, "ownerId")}/analyses/${uuid(analysisId, "analysisId")}/exports/${uuid(exportId, "exportId")}/report.html`
}

export function accountArtifactKey(ownerId: string, exportId: string): string {
  return `artifacts/${uuid(ownerId, "ownerId")}/account/exports/${uuid(exportId, "exportId")}/account-data.json`
}
