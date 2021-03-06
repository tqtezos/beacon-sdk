import { MatrixHttpClient } from '../MatrixHttpClient'
import { MatrixRoom, MatrixRoomStatus } from '../models/MatrixRoom'

import { MatrixEventSendResponse } from '../models/api/MatrixEventSend'
import { MatrixSyncResponse } from '../models/api/MatrixSync'
import { MatrixStateEventMessageContent } from '../models/MatrixStateEvent'

interface MatrixScheduledEvent<T> {
  accessToken: string
  room: MatrixRoom
  type: MatrixEventType
  content: any
  txnId: string
  onSuccess(response: T): void
  onError(error: unknown): void
}

type MatrixEventType = 'm.room.message'

type CacheKeys = 'sync'

export interface MatrixSyncOptions {
  syncToken?: string
  pollingTimeout?: number
}

export class MatrixEventService {
  private readonly cachedPromises: Map<CacheKeys, Promise<any>> = new Map()

  constructor(private readonly httpClient: MatrixHttpClient) {}

  public async sync(accessToken: string, options?: MatrixSyncOptions): Promise<MatrixSyncResponse> {
    return this.withCache('sync', () =>
      this.httpClient.get<MatrixSyncResponse>(
        '/sync',
        {
          timeout: options ? options.pollingTimeout : undefined,
          since: options ? options.syncToken : undefined
        },
        { accessToken }
      )
    )
  }

  public async sendMessage(
    accessToken: string,
    room: MatrixRoom,
    content: MatrixStateEventMessageContent,
    txnId: string
  ): Promise<MatrixEventSendResponse> {
    return new Promise((resolve, reject) =>
      this.scheduleEvent({
        accessToken,
        room,
        type: 'm.room.message',
        content,
        txnId,
        onSuccess: resolve,
        onError: reject
      })
    )
  }

  public scheduleEvent(event: MatrixScheduledEvent<any>) {
    // TODO: actual scheduling
    this.sendEvent(event)
  }

  public async sendEvent(scheduledEvent: MatrixScheduledEvent<any>): Promise<void> {
    const { room, type, txnId, content, accessToken } = scheduledEvent

    if (room.status !== MatrixRoomStatus.JOINED && room.status !== MatrixRoomStatus.UNKNOWN) {
      return Promise.reject(`User is not a member of room ${room.id}.`)
    }

    try {
      const response = await this.httpClient.put<MatrixEventSendResponse>(
        `/rooms/${room.id}/send/${type}/${txnId}`,
        content,
        { accessToken }
      )
      scheduledEvent.onSuccess(response)
    } catch (error) {
      scheduledEvent.onError(error)
    }
  }

  private withCache<T>(key: CacheKeys, promiseProvider: () => Promise<T>): Promise<T> {
    let promise = this.cachedPromises.get(key)

    if (!promise) {
      promise = promiseProvider().finally(() => {
        this.cachedPromises.delete(key)
      })
      this.cachedPromises.set(key, promise)
    }

    return promise
  }
}
