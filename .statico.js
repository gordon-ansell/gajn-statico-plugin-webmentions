/**
 * Please refer to the following files in the root directory:
 * 
 * README.md        For information about the package.
 * LICENSE          For license details, copyrights and restrictions.
 */
'use strict';

const { syslog, merge } = require('js-framework');
const path = require('path');
const pack = require('./package.json');
const WebmentionsData = require('./src/webmentionsData');
const WebmentionsProcessor = require('./src/webmentionsProcessor');
const debug = require('debug')('Statico:plugin:webmentions'),
      debugf = require('debug')('Full.Statico:plugin:webmentions');


async function afterParsedTemplateFile(cfg, tf)
{
    if (!cfg.webmentions || !cfg.webmentions.id) {
        syslog.warning("Webmentions processing switched off. Perhaps you want to include a 'webmentions' block in the config.")
        return null;
    } 
    let proc = WebmentionsProcessor.getProcessor(cfg);

    // Save the URL.
    let url = cfg.hostname + tf.data.permalink;

    // Received.
    let wmentions = proc.mentionsForUrl(url);
    if (wmentions && wmentions.length > 0) {
        tf.data.wmentions = wmentions;
        syslog.notice(`Post ${tf.data.permalink} has ${wmentions.length} webmentions.`);
    } else {
        debug(`Post ${tf.data.permalink} has no webmentions.`);
    }

    // To send.
    if (!tf.data.sendWebmentions) {
        return;
    }

    let test = (cfg.mode == 'dev') ? true : false;

    for (let wm of tf.data.sendWebmentions) {
        if (!proc.hasBeenSent(url, wm, test)) {
            await proc.send(url, wm, test);
        }
    }
}

async function afterInit(cfg)
{
    if (!cfg.webmentions || !cfg.webmentions.id) {
        syslog.warning("Webmentions processing switched off. Perhaps you want to include a 'webmentions' block in the config.")
        return null;
    } 
    let wmd = new WebmentionsData(cfg);
    cfg.mentions = await wmd.process();
}

module.exports = async function(config, options = {}) {

    let webmentionsSpecDef = {
        cacheFile: 'received.json',
        cacheFileTest: 'testReceived.json',
        mentionsApi: "https://webmention.io/api/mentions.jf2",
        on: false,
        ownUrls: undefined,
        perPage: 10000,
        sentFile: 'sent.json',
        sentFileTest: 'testSent.json',
        typeIcons: true,
        types: ['mention-of', 'in-reply-to'],
        wmDir: '_data/_webmentions/_cache',
    };

    if (config.webmentionsSpec) {
        config.webmentionsSpec = merge.merge(webmentionsSpecDef, config.webmentionsSpec)
    } else {
        config.webmentionsSpec = webmentionsSpecDef;
    }

    config.addCallable('isOwnWebmention', function(cfg, webmention) {
        const urls = (cfg.webmentionsSpec.ownUrls) ? (cfg.webmentionsSpec.ownUrls) : 
            [cfg.hostname];
        const authorUrl = webmention['author'] ? webmention['author']['url'] : null;
        return authorUrl && urls.includes(authorUrl);
    });

    config.events.on('statico.init.finished', afterInit);
    config.events.on('statico.parsedtemplatefile', afterParsedTemplateFile);

    syslog.notice(`Statico webmentions plugin version ${pack.version} loaded.`);

}
