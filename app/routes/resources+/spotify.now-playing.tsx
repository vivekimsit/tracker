import type { LoaderArgs } from '@remix-run/node'
import { CurrentlyPlayingTrack, SimplifiedTrackInfo } from 'types/spotify.ts'
import { getToken, refreshAccessToken } from '~/utils/spotify.ts'

const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`

export async function loader({}: LoaderArgs) {
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

const extractTrackInfo = (
	track: CurrentlyPlayingTrack,
): SimplifiedTrackInfo => {
	return {
		trackTitle: track.item.name,
		albumName: track.item.album.name,
		trackImageUrl: track.item.album.images[0].url, // Assuming you want the first image
	}
}
