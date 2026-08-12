import { jwtVerify, type JWTPayload } from "jose"

export const SESSION_ISSUER = "debate-analyser"
export const SESSION_AUDIENCE = "debate-analyser-web"
const encoder = new TextEncoder()

export async function verifyApplicationSession(
  token: string,
  secret: string,
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"],
    })
    return payload.sub ? payload : null
  } catch {
    return null
  }
}
