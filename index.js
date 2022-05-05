import { Bee } from '@ethersphere/bee-js'
import { Logger, Strings, System } from 'cafe-utility'
import chalk from 'chalk'

const deferred = process.argv[2] === '--deferred'
const UPLOADER_HOST = deferred
    ? 'https://gateway-proxy-bee-3-0.gateway.ethswarm.org'
    : 'https://gateway-proxy-bee-7-0.gateway.ethswarm.org'
const DOWNLOADER_HOST = 'https://gateway-proxy-bee-4-0.gateway.ethswarm.org'
const RETRY_ATTEMPTS = 3
const RETRY_INTERVAL = 10_000
const TIMEOUT_MS = 30_000

const logger = Logger.create(import.meta.url)
const stamp = '00'.repeat(32)
const uploaderBee = new Bee(UPLOADER_HOST)
const downloaderBee = new Bee(DOWNLOADER_HOST)
let lastReference = null

logger.info('Upload host:', UPLOADER_HOST)
logger.info('Download host:', DOWNLOADER_HOST)

while (true) {
    try {
        await doInitialWrite()
        while (true) {
            await appendByte()
            await System.sleepMillis(RETRY_INTERVAL)
        }
    } catch {
        logger.error('Ran out of retry attempts, restarting loop')
    }
}

async function doInitialWrite() {
    const data = Strings.randomAlphanumeric(1)
    logger.info(chalk.blue(`Uploading initial data "${data}"`))
    const { reference } = await uploaderBee.uploadData(stamp, data, {
        deferred,
        timeout: TIMEOUT_MS
    })
    lastReference = reference
    logger.info(`Uploaded "${data}" and got reference "${reference}"`)
}

async function appendByte() {
    const text = await downloadBytesWithRetry(lastReference)
    logger.info(chalk.green(`Got text "${text}" which is correct`))
    const appendedText = `${text}${Strings.randomAlphanumeric(1)}`
    logger.info(chalk.blue(`Uploading appended data "${appendedText}"`))
    const { reference } = await uploaderBee.uploadData(stamp, appendedText, {
        deferred,
        timeout: TIMEOUT_MS
    })
    lastReference = reference
}

async function downloadBytesWithRetry(reference) {
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        logger.info('Attempt', i, 'to download reference', reference)
        try {
            const data = await downloaderBee.downloadData(reference, {
                timeout: TIMEOUT_MS
            })
            const text = data.text()
            return text
        } catch (error) {
            await System.sleepMillis(RETRY_INTERVAL)
        }
    }
    throw Error(`Failed to download reference ${reference}`)
}
