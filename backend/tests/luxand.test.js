/**
 * AVENIR AI - Luxand.cloud Face Detection Integration Tests
 * Verifies token configuration, validation, error handling, and real API detection.
 */

require('dotenv').config();
const assert = require('assert');
const { getLuxandToken, isLuxandConfigured } = require('../config/luxand');
const luxandService = require('../services/luxandService');

async function runTests() {
  console.log('========================================================');
  console.log('   Running Luxand.cloud Integration Test Suite          ');
  console.log('========================================================\n');

  // Test 1: Token exists and is not empty
  console.log('1. Verifying LUXAND_API_TOKEN configuration...');
  assert.strictEqual(isLuxandConfigured(), true, 'isLuxandConfigured() should return true');
  const token = getLuxandToken();
  assert.ok(typeof token === 'string' && token.length > 10, 'Token must be a valid non-empty string');
  console.log('   PASS: Token is present and verified.\n');

  // Test 2: Validation of invalid inputs (empty buffer)
  console.log('2. Verifying input validation for empty buffers...');
  try {
    await luxandService.detectFace(Buffer.from([]));
    assert.fail('Should have thrown an error for empty buffer');
  } catch (err) {
    assert.ok(err.message.includes('Invalid image buffer'), 'Correct validation message for empty buffer');
    console.log('   PASS: Empty buffer correctly rejected.\n');
  }

  // Test 3: Real API call to Luxand.cloud with a portrait face image
  console.log('3. Testing real Luxand.cloud Face Detection API with sample portrait...');
  try {
    // Fetch a public OpenCV sample portrait (Lena standard test image)
    const imgRes = await fetch('https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg');
    assert.strictEqual(imgRes.ok, true, 'Sample image download succeeded');
    const arrayBuffer = await imgRes.arrayBuffer();
    const faceBuffer = Buffer.from(arrayBuffer);

    console.log(`   Fetched test image: ${faceBuffer.length} bytes. Sending to Luxand.cloud...`);
    const result = await luxandService.detectFace(faceBuffer, 'image/jpeg');

    console.log('   Luxand Response Result:', JSON.stringify(result, null, 2));

    assert.strictEqual(result.detected, true, 'Face should be detected');
    assert.ok(result.facesCount >= 1, 'Face count should be at least 1');
    assert.ok(Array.isArray(result.faces), 'faces should be an array');

    const firstFace = result.faces[0];
    assert.ok(firstFace.rectangle, 'Face must contain bounding box rectangle');
    assert.ok(typeof firstFace.rectangle.top === 'number', 'rectangle.top must be a number');
    assert.ok(typeof firstFace.rectangle.left === 'number', 'rectangle.left must be a number');
    assert.ok(typeof firstFace.age === 'number', 'Age should be an estimated number');
    assert.ok(typeof firstFace.gender === 'string', 'Gender should be classified');

    console.log('   PASS: Real Luxand.cloud face detection executed and parsed successfully.\n');
  } catch (err) {
    console.error('   FAIL: Real face detection test failed:', err);
    process.exit(1);
  }

  // Test 4: Testing non-face image returns detected: false
  console.log('4. Testing Luxand.cloud with an image containing no faces...');
  try {
    const nonFaceRes = await fetch('https://raw.githubusercontent.com/opencv/opencv/master/samples/data/board.jpg');
    assert.strictEqual(nonFaceRes.ok, true, 'Non-face test image download succeeded');
    const arrayBuffer = await nonFaceRes.arrayBuffer();
    const nonFaceBuffer = Buffer.from(arrayBuffer);

    const result = await luxandService.detectFace(nonFaceBuffer, 'image/jpeg');
    console.log('   Non-face result:', JSON.stringify(result));

    assert.strictEqual(result.detected, false, 'No face should be detected in board.jpg');
    assert.strictEqual(result.facesCount, 0, 'facesCount should be 0');
    assert.deepStrictEqual(result.faces, [], 'faces array should be empty');
    console.log('   PASS: Non-face image properly handled (detected: false, 0 faces).\n');
  } catch (err) {
    console.error('   FAIL: Non-face detection test failed:', err);
    process.exit(1);
  }

  console.log('========================================================');
  console.log('   ALL LUXAND.CLOUD TESTS PASSED SUCCESSFULLY! (4/4)    ');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

