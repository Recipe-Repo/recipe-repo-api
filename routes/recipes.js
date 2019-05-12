const express = require('express')
const router = express.Router()

const mongoose = require('mongoose')
const multer = require('multer')

var Recipe = require('../Schema/recipe')

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'tmp/images/')
  },
  filename: function (req, file, cb) {
    cb(null, mongoose.Types.ObjectId().toString())
  }
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }
}).any()

function extractRecipe (body) {
  var recipe = new Recipe()
  recipe.name = body.name
  recipe.ingredients = JSON.parse(body.ingredients)
  recipe.instructions = body.instructions
  recipe.sourceName = body.sourceName
  recipe.sourceUrl = body.sourceUrl
  recipe.prepTime = body.prepTime
  recipe.cookTime = body.cookTime
  recipe.servings = body.servings
  recipe.keywords = body.keywords
  return recipe
}

async function deleteImages (recipe, callback) {
  for (var i = 0; i < recipe.images.length; i++) {
    await deleteImage(recipe.id, recipe.images[i].name, () => {})
  }
  return callback()
}

async function deleteImage (recipeID, imageName, callback) {
  var fs = require('fs')
  fs.unlink(buildImagePath(recipeID, imageName), callback)
}

async function moveImage (source, destination, callback) {
  var fs = require('fs')
  var path = require('path')
  const parentDirectory = path.dirname(destination)
  fs.mkdir(parentDirectory, err => {
    if (err && err.code != 'EEXIST') {
      callback(err)
    }
    fs.copyFile(source, destination, (err) => {
      if (err) {
        callback(err)
      }
      fs.unlink(source, callback)
    })
  })
}

function buildImagePath (recipeId, imageName) {
  const imagePath = process.env.IMAGE_DIR + '/' + recipeId + '/' + imageName
  return imagePath
}

router.route('/')
  .get((req, res) => {
    console.log('Fetching recipes')

    Recipe.find({}, function (err, recipes) {
      if (err) {
        res.sendStatus(500)
      } else {
        res.json(recipes)
      }
    })
  })
  .post(upload, (req, res) => {
    const newRecipe = extractRecipe(req.body)

    newRecipe.save(function (err, savedRecipe) {
      if (err) {
        console.log(err)
        res.sendStatus(500)
      } else {
        console.log('Recipe successfully saved!')
        res.json(savedRecipe)
      }
    })
  })

router.route('/:id')
  .get((req, res) => {
    console.log('Fetching recipe with id: ' + req.params.id)

    Recipe.findById(req.params.id, function (err, recipe) {
      if (err) {
        res.sendStatus(500)
      } else {
        res.json(recipe)
      }
    })
  })
  .put(upload, (req, res) => {
    var newRecipe = extractRecipe(req.body).toObject()
    delete newRecipe._id
    delete newRecipe.images

    const matchIDQuery = { _id: { $eq: req.params.id } }
    Recipe.findOneAndUpdate(matchIDQuery, newRecipe, { runValidators: true }, (err, recipe) => {
      if (err) {
        console.log(err)
        res.sendStatus(500)
      } else {
        console.log(recipe.name + ' successfully updated!')
        res.json(recipe)
      }
    })
  })
  .delete((req, res) => {
    Recipe.findByIdAndDelete(req.params.id, function (err, recipe) {
      if (err) {
        console.log(err)
        res.sendStatus(500)
      } else {
        console.log(recipe.name + ' successfully deleted!')
        deleteImages(recipe, () => { console.log('Deleted images from ' + recipe.name) })
        res.sendStatus(200)
      }
    })
  })

router.route('/:id/images')
  .post(upload, (req, res) => {
    const destination = buildImagePath(req.params.id, req.files[0].filename)

    const newImage = { name: req.files[0].filename }

    moveImage(req.files[0].path, destination, (err) => err ? console.log(err) : null)
    Recipe.findByIdAndUpdate(
      { _id: req.params.id },
      { $push: { images: newImage } },
      function (err, recipe) {
        if (err) {
          res.sendStatus(500)
        } else {
          res.json(recipe)
        }
      }
    )
  })

router.route('/:id/images/:imageid')
  .get((req, res) => {
    const imagePath = '/' + buildImagePath(req.params.id, req.params.imageid)
    res.redirect(imagePath)
  })
  .delete((req, res) => {
    Recipe.findByIdAndUpdate(req.params.id, { $pull: { images: { name: req.params.imageid } } }, function (err, recipe) {
      if (err) {
        console.log(err)
        res.sendStatus(500)
      } else {
        var fs = require('fs')
        fs.unlink(buildImagePath(req.params.id, req.params.imageid), (err) => err ? console.log(err) : null)

        console.log('image ' + req.params.imageid + ' successfully deleted!')
        res.sendStatus(200)
      }
    })
  })

module.exports = router
