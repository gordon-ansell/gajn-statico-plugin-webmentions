/**
 * Please refer to the following files in the root directory:
 * 
 * README.md        For information about the package.
 * LICENSE          For license details, copyrights and restrictions.
 */
'use strict';

const fetch = require('node-fetch');
const unionBy = require('lodash/unionBy');
const path = require('path');
const fs = require('fs');
const { syslog } = require('gajn-framework');

/**
 * Webmentions data fetch class.
 */
class WebmentionsData
{
    /**
     * Configs.
     */
    cfg = null;

    /**
     * Spec.
     */
    spec = null;

    /**
     * Constructor.
     * 
     * @param   {object}    cfg     Context.
     */
    constructor(cfg)
    {
        this.cfg = cfg;
        this.spec = this.cfg.webmentionsSpec;
    }

    /**
     * Merge the webmentions.
     * 
     * @param   {object}    a   First object.
     * @param   {object}    b   Second object.
     * 
     * @return  {object}        Unioned object.
     */
    mergeWebMentions(a, b)
    {
        return unionBy(a.children, b.children, 'wm-id');
    }

    /**
     * Read webmentions cache.
     * 
     * @param   {boolean}   test    Test?
     * @return  {object}            Object with last fetched date and all the mentions.
     */
    readWebMentionsCache(test = false)
    {
        let ret = {
            lastFetched: null,
            children: []
        };

        let fn = (test) ? this.spec.cacheFileTest : this.spec.cacheFile;

        const wmCachePath = path.join(this.cfg.sitePath, this.spec.wmDir, fn);

        if (fs.existsSync(wmCachePath)) {
            let parsed = JSON.parse(fs.readFileSync(wmCachePath));
            ret.lastFetched = parsed.lastFetched;
            ret.children = parsed.children;
        }

        return ret;
    }

    /**
     * Write webmentions cache.
     * 
     * @param   {object}    data    Data to write.
     * @param   {boolean}   test    Test?
     */
    writeWebMentionsCache(data, test = false)
    {
        let fn = (test) ? this.spec.cacheFileTest : this.spec.cacheFile;

        const wmCachePath = path.join(this.cfg.sitePath, this.spec.wmDir, fn);

        let final = JSON.stringify(data, null, 2);

        fs.writeFileSync(wmCachePath, final);
    }

    /**
     * Fetch any new webmentions.
     * 
     * @param   {string}    since   Fetch since when?
     * @return  {object}            New webmentions.
     */
    async fetchNewWebMentions(since = null)
    {
        // Sanity checks.     
        if (!this.spec.mentionsApi) {
            syslog.error("No webmentions API URL specified.");
            return null;
        }

        if (!this.cfg.webmentions || !this.cfg.webmentions.id) {
            syslog.error("No webmentions id specified.");
            return null;
        }

        if (!this.cfg.webmentions.apiKey) {
            syslog.error("No webmentions API key specified.");
            syslog.inspect(this.cfg.webmentions);
            return null;
        }

        // See if there are any new webmentions.
        let wmUrl = this.spec.mentionsApi + '?domain=' + this.cfg.webmentions.id + 
            '&token=' + this.cfg.webmentions.apiKey;

        if (since) {
            wmUrl += '&since=' + since;
        }

        if (this.spec.perPage) {
            wmUrl += '&per-page=' + this.spec.perPage; 
        }

        const response = await fetch(wmUrl);

        let feed = null;

        if (response.ok) {
            feed = await response.json();
            return feed;
        } 

        return null;
    }

    /**
     * Processor.
     * 
     * @return  {object}            Webmentions data.
     */
    async process()
    {
        if (!this.cfg.webmentions || !this.cfg.webmentions.id) {
            return true;
        }  

        let isDev = (this.cfg.mode == 'dev' || mode == 'dev') ? true : false;

        let wmCached; 
        
        if (isDev) {
            wmCached = this.readWebMentionsCache(true);
            syslog.notice("Using test webmentions as we're in dev mode.")
        } else {
            wmCached = this.readWebMentionsCache();
        }

        if (!isDev) {
            let newFeed = await this.fetchNewWebMentions(wmCached.lastFetched);

            if (newFeed) {
                syslog.notice("==> We have " + newFeed.children.length + " NEW webmentions.");
                const wmFeed = {
                    lastFetched: new Date().toISOString(),
                    children: this.mergeWebMentions(wmCached, newFeed)
                }

                this.writeWebMentionsCache(wmFeed, isDev);
                this.mentions = wmFeed.children;

                //return true;
                return wmFeed.children;
            }
        }

        syslog.notice('We have ' + wmCached.children.length + ' webmentions in total.');
        return wmCached.children;
    }

}

module.exports = WebmentionsData;

