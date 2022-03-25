/**
 * Please refer to the following files in the root directory:
 * 
 * README.md        For information about the package.
 * LICENSE          For license details, copyrights and restrictions.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const sanitizeHTML = require('sanitize-html');
const wmsend = require('send-webmention')
const syslog = require('js-framework/src/logger/syslog');
const { fsutils } = require('js-framework');
const debugt = require('debug')('WM');

/**
 * Webmentions processing class.
 */
class WebmentionsProcessor
{
    /**
     * Processor.
     */
    static proc = null;

    /**
     * The mentions (received) themselves.
     */
    mentions = null;

    /**
     * The mentions (sent).
     */
    mentionsSent = null;

    /**
     * Configs.
     */
    cfg = null;

    /**
     * Get the processor.
     * 
     * @param   {object}    cfg      Configs.
     * @return  {object}             Processor instance.
     */
    static getProcessor(cfg)
    {
        if (WebmentionsProcessor.proc == null) {
            WebmentionsProcessor.proc = new WebmentionsProcessor(cfg);
        }
        return WebmentionsProcessor.proc;
    }

    /**
     * Constructor.
     * 
     * @param   {object}    cfg     Configs.
     */
    constructor(cfg)
    {
        this.cfg = cfg;
        this.spec = this.cfg.webmentionsSpec;
        this.mentions = this.cfg.mentions;

    }

    /**
     * Get the web mentions for a particular URL.
     * 
     * @param   {string}    url     URL to get them for.
     * @return  {object}            Webmentions.
     */
    mentionsForUrl(url)
    {
        if (url.indexOf("star-trek-discovery") !== -1) {
            debugt(`In the processor.`);
        }

        if (!this.mentions) {
            return null;
        }

        const hasRequiredFields = (entry) => {
            const { author, published, content } = entry
            return author.name && published && content
        }

        if (url.indexOf("star-trek-discovery") !== -1) {
            debugt(`Has required fields.`);
        }

        const sanitize = (entry) => {
            const { content } = entry;
            if (content['content-type'] === 'text/html') {
                content.value = sanitizeHTML(content.value);
            }
            return entry
        }

        if (url.indexOf("star-trek-discovery") !== -1) {
            debugt(`Sanitized`);
        }

        let ret = this.mentions
            .filter((entry) => entry['wm-target'] === url)
            .filter((entry) => this.spec.types.includes(entry['wm-property']))
            .filter(hasRequiredFields)
            .map(sanitize);

        return ret;
    
    }

    /**
     * Get the webmentions sent.
     * 
     * @param   {boolean}   reload  Reload from the disk file?
     * @param   {bollean}   test    Test mode?
     * 
     * @returns {string[]}          Array of webmentions sent.
     */
    webMentionsSent(reload = false, test = false)
    {
        if (reload) {
            this.mentionsSent = null;
        }

        if (!this.cfg.sitePath) {
            syslog.error(`Cannot determine site path.`);
        }

        if (this.mentionsSent === null) {
            let fnt = (test) ? this.spec.sentFileTest : this.spec.sentFile;
            let fn = path.join(this.cfg.sitePath, this.spec.wmDir, fnt);
            if (fs.existsSync(fn)) {
                this.mentionsSent = JSON.parse(fs.readFileSync(fn, 'utf8'));
            } else {
                this.mentionsSent = [];
            }
        }

        return this.mentionsSent;
    }

    /**
     * See if we've sent a webmention.
     * 
     * @param   {string}    source  Source URL.
     * @param   {string}    target  Target URL.
     * 
     * @return  {string|boolean}    DateTime it has been sent, else false.
     */
    hasBeenSent(source, target, test = false)
    {
        let t = source + '|' + target;
        for (let line of this.webMentionsSent(false, test)) {
            if (line.startsWith(t)) {
                return line.split('|')[2];
            }
        }
        return false;
    }

    /**
     * Send a web mention.
     * 
     * @param   {string}    source  Source URL.
     * @param   {string}    target  Tarjet URL.
     * @param   {string}    test    Testing?
     */
    async send(source, target, test = false)
    {
        if (!test) {

            await wmsend(source, target, (err, obj) => {
                if (err) throw err;

                if (obj.success) {
                    syslog.notice("==> Sent webmention from: " + source + " to: " + target);
                    this.logSent(source, target, false);
                } else {
                    syslog.warning("Failed to send webmention from: " + source + " to: " + target + 
                        ". Target site probably does not have a webmentions endpoint.");
                }
            });

        } else {

            syslog.notice("==> Dummy webmention send from: " + source + " to: " + target);
            this.logSent(source, target, true);

        }
    }

    /**
     * Log that webmention has been sent.
     * 
     * @param   {string}    source  Source URL.
     * @param   {string}    target  Target URL.
     * @param   {boolean}   test    Testing?
     */
    logSent(source, target, test = false)
    {
        let line = source + '|' + target + '|' + new Date().toISOString();
        this.mentionsSent.unshift(line);    
        let fnt = (test) ? this.spec.sentFileTest : this.spec.sentFile;
        let fn = path.join(this.cfg.sitePath, this.spec.wmDir, fnt);
        fsutils.mkdirRecurse(path.dirname(fn));
        fs.writeFileSync(fn, JSON.stringify(this.mentionsSent, null, 1));
        this.mentionsSent = null;   
    }

}

module.exports = WebmentionsProcessor;
