const express = require('express');
const { requireHubFullApiAccess } = require('../middleware/hubAuth');
const { createSnapshotLoader, buildCustomers, selectCustomers } = require('../services/customerInsights');
function createRouter(pool = require('../db/pool'), load = createSnapshotLoader(pool)) {
  const router = express.Router();
  router.get('/api/insights/customers', requireHubFullApiAccess, async (req,res,next) => {
    const { years='3', preset='contact', search='', page='1' } = req.query;
    if (!['1','2','3','5'].includes(years) || !['contact','value','orders','lapsed','dormant','all'].includes(preset) || typeof search !== 'string' || search.length > 200 || typeof page !== 'string' || !/^\d{1,6}$/.test(page) || Number(page)<1) {
      return res.status(400).json({error:'Choose a valid period, preset, search and page.'});
    }
    try {
      const result = buildCustomers(await load(), {years:Number(years)});
      res.set('Cache-Control','no-store');
      res.json(selectCustomers(result,{preset,search,page:Number(page)}));
    } catch(error) { next(error); }
  });
  return router;
}
module.exports = { createRouter };
