// decode front, this is simply executed to obtain the front-end
// element that has been clicked.
//
// Adds a listener which removes itself when called. This is a
// work around until this is fixed: crbug.com/39507

// Put all image elements in the element into an array.
function getImages(element) {
	var imgs = [];
	if (element.tagName === "IMG") {
		imgs.push(element);
	} else {
		for (let child of element.children) {
			imgs = imgs.concat(getImages(child));
		}
	}
	return imgs;
}

function getCandidates(element) {
	imgs = getImages(element);
	let candidates = [];
	for (let img of imgs) {
		// For now, only PNGs are valid candidates.
		if (img.src.endsWith(".png")) {
			candidates.push(String(img.src));
            // Leave bread crumb.
            img.dataset.stegourl = img.src;
		}
	}
	return {
        candidates: candidates,
        imgs: imgs,
    };
}

function overlay_message(img, message) {
    let imgParent = img.parentElement;
    let container = document.createElement('div');
    let style = container.style;
    style.class = 'stegodiv';
    style.position = 'absolute';
    style.left = '50%';
    style.bottom = '50%';
    style.zIndex = '10';
    style.background = 'black';
    style.color = 'white';
    style.opacity = '0.7';
    style.minWidth = '100%';
    style.transform = 'translate(-50%, 50%)';
    style['font-family'] = 'Consolas, Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace, serif';
    imgParent.style['text-align'] = 'center';
    container.innerHTML = message;
    imgParent.appendChild(container);
}

function embed(url, message) {
    // Find all the bread crumbs.
    imgs = document.querySelectorAll('[data-stegourl]');
    for (let img of imgs) {
        // Remove bread crumb.
        delete(img.dataset.stegourl);
        if (String(img.src) == url) {
            console.log('img:', img, 'message', message);
            // TODO: Before overlaying message, delete existing ones.
            overlay_message(img, message);
        }
    }
}

function pageListener(message, sender, sendResponse) {
	chrome.runtime.onMessage.removeListener(pageListener);
	if (sender.id != chrome.runtime.id) {
		console.log("Unexpected sender", sender, message);
		return;
	}
	if (message.messageId == "getElement") {
		let {candidates} = getCandidates(document.activeElement);
		sendResponse(candidates);
	} else if (message.messageId == "embedElement") {
        embed(message.targetUrl, message.targetMessage);
    } else {
		console.log("Unexpected message", message);
	}
}

// This line will be executed when this script is executed in the
// page, adding a message listener.
chrome.runtime.onMessage.addListener(pageListener);
