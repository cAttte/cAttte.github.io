import dataES from "./data-es.js"
import dataEN from "./data-en.js"
import dataXX from "./data-xx.js"
const data = { es: dataES, en: dataEN, xx: dataXX }
// const fuse = new Fuse(data.es.items, { keys: ["id", "name", "note"] })
// const qs = new quickScore.QuickScore(data.es.items, ["id", "name", "note"])

data.en.items.forEach(item => {
    item.id_prep = fuzzysort.prepare(item.id)
    item.name_prep = fuzzysort.prepare(item.name)
})

data.es.items.forEach((item, i) => {
    item.id_prep = fuzzysort.prepare(item.id)
    item.name_prep = fuzzysort.prepare(item.name)
    item.en = data.en[i]
})

/** @type {HTMLDialogElement} */
let modal

window.addEventListener("load", () => {
    const image = document.getElementById("map")
    window.pz = new PinchZoom.default(image, { tapZoomFactor: 3, minZoom: 0.85, useMouseWheel: true, maxZoom: 12 })
    /** @type {SVGSVGElement} */
    const svg = document.getElementById("map-svg")

    image.addEventListener("click", event => showPartInfo(event.target.parentElement.getAttribute("data-id")))

    modal = document.getElementById("modal")

    const isInsideModal = event => {
        const rect = modal.getBoundingClientRect()
        return (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
        )
    }

    const handleModalPress = event => {
        const inside = event.touches ? Array.from(event.touches).some(isInsideModal) : isInsideModal(event)
        if (!inside) modal.close(), event.preventDefault()
    }

    const handleModalClick = event => {
        if (event.target.tagName === "ABBR") {
            const tooltip = document.createElement("div")
            tooltip.classList.add("box")
            // tooltip.textContent ="ello mate"
        }
    }

    modal.addEventListener("mousedown", handleModalPress)
    modal.addEventListener("touchstart", handleModalPress)
    modal.addEventListener("click", handleModalClick)

    const results = document.getElementById("results")
    /** @type {HTMLButtonElement} */
    const searchButton = document.getElementById("search-button")
    /** @type {HTMLInputElement} */
    const searchInput = document.getElementById("search-input")

    let searchOpen = false
    searchButton.addEventListener("click", () => toggleSearch(!searchOpen))
    searchInput.addEventListener("blur", () => setTimeout(() => toggleSearch(false), 100))

    const toggleSearch = open => {
        searchOpen = open
        open ? searchInput.focus() : searchInput.blur()
        if (!open) {
            results.style.display = "none"
            searchInput.value = ""
        }

        searchInput.style.padding = open ? "revert-layer" : 0
        searchInput.style.transform = open ? "translateX(0px)" : "translateX(20px)"
        searchInput.style.width = open ? "250px" : 0
        searchInput.style.color = open ? "revert-layer" : "transparent"
        searchButton.style.borderBottomLeftRadius = open ? 0 : "revert-layer"
        searchButton.style.borderTopLeftRadius = open ? 0 : "revert-layer"
    }

    searchInput.addEventListener("input", () => {
        const container = document.getElementById("results")
        container.replaceChildren()
        const query = searchInput.value.toLowerCase()
        console.log(query)
        if (!query) return (container.style.display = "none")
        else {
            console.log("ok man")
            container.style.display = "revert-layer"
        }

        const results = fuzzysort
            .go(query, data.es.items, { threshold: 0.4, keys: ["id_prep", "name_prep", "en.id_prep", "en.name_prep"] })
            .map(res => res.obj)
        results.forEach(({ id, name }) => {
            const item = document.createElement("a")
            item.className = "dropdown-item"
            item.setAttribute("data-id", id)
            item.style.textWrap = "pretty"
            item.textContent = name
            item.style.display = "flex"
            item.style.alignItems = "center"

            const id_ = document.createElement("span")
            id_.textContent = id
            id_.style.fontSize = "12px"
            id_.style.marginRight = "8px"
            id_.style.display = "inline-block"
            // id_.style.textAlign = "right"
            id_.style.minWidth = "25px"
            item.prepend(id_)

            container.appendChild(item)
        })

        if (!results.length) {
            const text = document.createElement("li")
            text.className = "dropdown-item"
            text.style.textAlign = "center"
            text.textContent = "No hay resultados."
            container.appendChild(text)
        }

        if (container.scrollHeight <= container.clientHeight) container.classList.add("bottom")
        else container.classList.remove("bottom")
    })

    results.addEventListener("scroll", () => {
        const bottom = results.scrollHeight - results.offsetHeight - results.scrollTop
        bottom < 5 ? results.classList.add("bottom") : results.classList.remove("bottom")
    })

    // console.log(results)

    results.addEventListener("click", event => {
        toggleSearch(false)

        const id = event.target.getAttribute("data-id")
        const pieces = Array.from(document.querySelectorAll(`#map-svg > a[data-id="${id}"] > rect`)).map(part =>
            ["x", "y", "width", "height"].map(attr => part[attr].baseVal.value)
        )

        let [partX, partY, partW, partH] = getBoundingRect(pieces) // v if too much space btwn, pick the biggest part
        if (10 * Math.min(...pieces.map(([_x, _y, w, h]) => (w + h) / 2)) < (partW + partH) / 2)
            [partX, partY, partW, partH] = pieces.reduce((a, b) => ((a[1] + a[2]) / 2 > (b[1] + b[2]) / 2 ? a : b))

        const partSz = (partW + partH) / 2
        const targetZoomFactor = Math.max(3, 9 + (partSz * (3 - 9)) / 150) // map size 0-150 => zoom 9-3 (clamp)
        const startZoomFactor = pz.zoomFactor

        const viewSize = () => Victor.fromSize(pz.container.getBoundingClientRect())
        const contentSize = Victor.fromSize(svg.getBoundingClientRect()).divs(startZoomFactor)

        const partCenter = new Victor(partX + partW / 2, partY + partH / 2)
        // adjust for difference between virtual <svg> size and physical size in DOM
        const scaledPartCenter = partCenter.clone().div(Victor.fromSize(svg.getBBox())).mul(contentSize)
        // adjust for difference between content <svg> and pz-container <div> dimensions (padding, etc.)
        const realPartCenter = scaledPartCenter.clone().add(viewSize().sub(contentSize).divs(2)).muls(targetZoomFactor)
        // place point in view's center instead of top left
        let partCenterInViewCenter = realPartCenter.clone().sub(viewSize().divs(2))

        const startOffset = pz.offset
        const targetOffset = partCenterInViewCenter

        const update = progress => {
            pz.scaleTo(startZoomFactor + progress * (targetZoomFactor - startZoomFactor), partCenterInViewCenter)
            pz.offset.x = startOffset.x + progress * (targetOffset.x - startOffset.x)
            pz.offset.y = startOffset.y + progress * (targetOffset.y - startOffset.y)
            pz.update()
        }

        // if (startZoomFactor > targetZoomFactor) center = pz.getCurrentZoomCenter()
        pz.animate(pz.options.animationDuration, update, pz.swing)

        showPartInfo(id)
        // console.log(anchor)
    })
})

const abbrs = Object.entries(data.xx.abbreviations).sort(([ak], [bk]) => bk.length - ak.length)
console.log(abbrs)

/** @param {string} id  */
window.showPartInfo = id => {
    if (!id) return
    const [catSp, idSp, nameSp, matSp, bodySp] = ["cat", "id", "name", "mat", "body"].map(x =>
        document.getElementById("modal-" + x)
    )
    const item = data.es.items.find(item => item.id === id)
    let markedName = item.name
    if (item.note) markedName += ` <span style="color: #777">(${item.note})</span>`
    markedName = markedName.replace(/\b[A-Z0-9\-/]+\b/g, abbrs => {
        const asFull = data.xx.abbreviations[abbrs]
        const exps = asFull ?? abbrs.replace(/\b[A-Z0-9]+\b/g, abbr => data.xx.abbreviations[abbr] ?? abbr)
        if (exps == abbrs) return abbrs
        else return `<abbr title="${exps.replace(/([a-z])([\-/])([A-Z])/g, "$1 $2 $3")}">${abbrs}</abbr>`
    })

    idSp.textContent = id
    catSp.textContent = findCategoryName(id)
    nameSp.innerHTML = markedName
    matSp.textContent = item.detail
    bodySp.textContent = item.body
    modal.showModal()
}

document.addEventListener("fullscreenchange", () => {
    const iconIn = document.getElementById("fullscreen-in")
    const iconOut = document.getElementById("fullscreen-out")
    const full = !!document.fullscreenElement

    if (full) screen.orientation.lock("landscape").catch(() => {})
    const [a, b] = full ? [iconOut, iconIn] : [iconIn, iconOut]
    a.style.display = "unset"
    b.style.display = "none"
})

/** @param {string} id  */
const findCategoryName = id => data.es.categories[id[0]] || data.es.categories[""]

/**
 * @typedef {[number, number, number, number]} Rect
 * @param {Rect[]} parts
 * @returns {Rect}
 */
const getBoundingRect = parts => {
    let [xaMin, yaMin, xbMax, ybMax] = [Infinity, Infinity, 0, 0]
    for (const [xa, ya, w, h] of parts) {
        xaMin = Math.min(xa, xaMin)
        yaMin = Math.min(ya, yaMin)
        xbMax = Math.max(xa + w, xbMax)
        ybMax = Math.max(ya + h, ybMax)
    }
    return [xaMin, yaMin, xbMax - xaMin, ybMax - yaMin]
}

Victor.prototype.mul = Victor.prototype.multiply
Victor.prototype.div = Victor.prototype.divide
Victor.prototype.sub = Victor.prototype.subtract
Victor.prototype.muls = Victor.prototype.multiplyScalar
Victor.prototype.divs = Victor.prototype.divideScalar
Victor.fromSize = size => new Victor(size.width, size.height)
