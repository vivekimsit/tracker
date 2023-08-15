import type { LoaderArgs } from '@remix-run/node'

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

const getAccessToken = async () => {
	const response = await fetch(TOKEN_ENDPOINT, {
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

	const grant = (await response.json()) as TokenGrant
	// console.log('Grant >>>', grant)
	return grant
}

export const getNowPlaying = async (): Promise<SimplifiedTrackInfo | null> => {
	const { access_token } = await getAccessToken()

	const response = await fetch(NOW_PLAYING_ENDPOINT, {
		headers: {
			Authorization: `Bearer ${access_token}`,
		},
	})

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
