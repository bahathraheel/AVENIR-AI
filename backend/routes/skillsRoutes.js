/**
 * AVENIR AI - Skills Routes
 */
const express = require('express');
const router = express.Router();
const { searchSkills, getBenchmark } = require('../controllers/skillsController');

router.get('/search', searchSkills);
router.get('/role-benchmark', getBenchmark);

module.exports = router;

