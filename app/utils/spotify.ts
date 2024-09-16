import { prisma } from '~/utils/db.server.ts'

const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`

const client_id = process.env.SPOTIFY_CLIENT_ID
const client_secret = process.env.SPOTIFY_CLIENT_SECRET
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN

if (!client_id || !client_secret || !refresh_token) {
	throw new Error('Missing Spotify credentials')
}

interface TokenGrant {
	access_token: string
	expires_in: number
	token_type: string
	refresh_token: string
}

interface ErrorResponse {
	error: string
	error_description: string
}

const basic = btoa(`${client_id}:${client_secret}`)

export const getToken = async (): Promise<string> => {
	const token = await prisma.oauthToken.findUnique({
		where: { refreshToken: refresh_token },
	})
	if (!token) throw new Error('No spotify access token found')

	return token.accessToken
}

export const refreshAccessToken = async (): Promise<string> => {
	const response = await requestTokenRefresh()

	if (!response.ok) {
		const errorDetails = (await response.json()) as ErrorResponse
		throw new Error(
			`Failed to refresh token. Error: ${errorDetails.error_description}`,
		)
	}

	const grant = (await response.json()) as TokenGrant
	await storeUpdatedToken(grant)

	return grant.access_token
}

const requestTokenRefresh = async () => {
	return await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${basic}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		// @ts-ignore
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token,
		}),
	})
}

const storeUpdatedToken = async (grant: TokenGrant) => {
	const expiration = new Date(Date.now() + grant.expires_in * 1000 - 1000)
	await prisma.oauthToken.upsert({
		where: { refreshToken: refresh_token },
		update: {
			accessToken: grant.access_token,
			expiration,
		},
		create: {
			refreshToken: refresh_token!,
			accessToken: grant.access_token,
			expiration,
		},
	})
}
