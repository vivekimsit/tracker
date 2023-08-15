import type { LoaderArgs } from '@remix-run/node'
import { prisma } from '~/utils/db.server.ts'

export type NowPlayingSong = {
	album: string
	albumImageUrl: string
	artist: string
	isPlaying: boolean
	songUrl: string
	title: string
}

export type Song = {
	songUrl: string
	artist: string
	title: string
}

interface TokenGrant {
	access_token: string
	expires_in: number
	token_type: string
	refresh_token: string
}

const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`

const client_id = process.env.SPOTIFY_CLIENT_ID
const client_secret = process.env.SPOTIFY_CLIENT_SECRET
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN

const basic = btoa(`${client_id}:${client_secret}`)

export async function loader({ params }: LoaderArgs) {
	return getNowPlaying()
}

export const getNowPlaying = async (): Promise<SimplifiedTrackInfo | null> => {
	let response
	try {
		const access_token = await getToken()
		response = await fetch(NOW_PLAYING_ENDPOINT, {
			headers: {
				Authorization: `Bearer ${access_token}`,
			},
		})
	} catch (error) {
		const newToken = await refreshAccessToken()
		response = await fetch(NOW_PLAYING_ENDPOINT, {
			headers: {
				Authorization: `Bearer ${newToken}`,
			},
		})
	}

	if (response.status === 401) {
		const newToken = await refreshAccessToken()
		response = await fetch(NOW_PLAYING_ENDPOINT, {
			headers: {
				Authorization: `Bearer ${newToken}`,
			},
		})
	}

	if (response.status === 204) {
		console.log('No song is currently playing.')
		return null
	}

	if (response.ok) {
		const data = (await response.json()) as CurrentlyPlayingTrack
		return extractTrackInfo(data)
	} else {
		console.error('Error fetching now playing:', response.statusText)
		return null
	}
}

/**
 * Update the access token by refreshing it
 */
/**
 * Refresh the access token using a stored refresh token.
 */
const refreshAccessToken = async (): Promise<string> => {
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

/**
 * Request to refresh the token from the Google OAuth2 endpoint.
 */
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

/**
 * Store the updated access token in the database.
 */
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

/**
 * Fetch the OAuth token from the database
 */
const getToken = async (): Promise<string> => {
	const token = await prisma.oauthToken.findUnique({
		where: { refreshToken: refresh_token },
	})
	if (!token) throw new Error('No spotify access token found')

	return token.accessToken
}

const extractTrackInfo = (
	track: CurrentlyPlayingTrack,
): SimplifiedTrackInfo => {
	return {
		trackTitle: track.item.name,
		albumName: track.item.album.name,
		trackImageUrl: track.item.album.images[0].url, // Assuming you want the first image
	}
}

type Album = {
	name: string
	images: {
		height: number
		url: string
		width: number
	}[]
}

type CurrentlyPlayingTrack = {
	item: {
		name: string // This is the track's title
		album: Album
	}
}

type SimplifiedTrackInfo = {
	trackTitle: string
	albumName: string
	trackImageUrl: string
}

interface ErrorResponse {
	error: string
	error_description: string
}
