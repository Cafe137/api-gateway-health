import { Bee } from '@ethersphere/bee-js'
import { Logger, Strings, System } from 'cafe-utility'
import chalk from 'chalk'
import Wallet from 'ethereumjs-wallet'

let lastKnownIndex = -1

const HOST = 'https://api.gateway.ethswarm.org'
// const HOST = 'https://gateway-proxy-bee-1-0.gateway.ethswarm.org'
const RETRY_ATTEMPTS = 180
const RETRY_INTERVAL = 20_000

const logger = Logger.create(import.meta.url)
const privateKeyString = Strings.randomHex(64)
const privateKey = Buffer.from(privateKeyString, 'hex')
const wallet = Wallet.default.fromPrivateKey(privateKey)
const topic = Strings.randomHex(64)
const stamp = '00'.repeat(32)
const bee = new Bee(HOST)
const feedWriter = bee.makeFeedWriter('sequence', topic, privateKey)
const feedReader = bee.makeFeedReader('sequence', topic, wallet.getAddressString())

await doInitialWrite()
while (true) {
    await appendFeed()
    await System.sleepMillis(RETRY_INTERVAL)
}

async function doInitialWrite() {
    const data = Strings.randomAlphanumeric(1)
    logger.info(chalk.blue(`Uploading initial data "${data}"`))
    const { reference } = await bee.uploadData(stamp, data)
    logger.info('Writing feed for the first time')
    await feedWriter.upload(stamp, reference)
}

async function appendFeed() {
    const text = await fetchTextFromFeed()
    logger.info(chalk.green(`Got text "${text}" which is correct`))
    const appendedText = `${text}${Strings.randomAlphanumeric(1)}`
    logger.info(chalk.blue(`Uploading appended data "${appendedText}"`))
    const { reference } = await bee.uploadData(stamp, appendedText)
    await updateFeedWithRetry(reference)
}

async function fetchTextFromFeed() {
    const reference = await fetchFeedWithRetry()
    const text = await downloadDataWithRetry(reference)
    return text
}

async function updateFeedWithRetry(reference) {
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        logger.info('Attempt', i, 'to update feed with reference', reference)
        try {
            await feedWriter.upload(stamp, reference)
            return
        } catch (error) {
            await System.sleepMillis(RETRY_INTERVAL)
        }
    }
    throw Error('Failed to update feed')
}

async function downloadDataWithRetry(reference) {
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        logger.info('Attempt', i, 'to download reference', reference)
        try {
            const data = await bee.downloadData(reference)
            const text = data.text()
            return text
        } catch (error) {
            await System.sleepMillis(RETRY_INTERVAL)
        }
    }
    throw Error(`Failed to download reference ${reference}`)
}

async function fetchFeedWithRetry() {
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        logger.info('Attempt', i, 'to fetch feed')
        try {
            const response = await feedReader.download()
            const feedIndex = parseInt(response.feedIndex, 10)
            if (feedIndex <= lastKnownIndex) {
                logger.warn('Got a past feed update of index', feedIndex, 'but expected greater than', lastKnownIndex)
                throw Error('Outdated')
            }
            lastKnownIndex = feedIndex
            logger.info('Fetched feed, got index', response.feedIndex, 'with reference', response.reference)
            return response.reference
        } catch (error) {
            await System.sleepMillis(RETRY_INTERVAL)
        }
    }
    throw Error('Failed to fetch feed')
}
