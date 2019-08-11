// This is the install script for the extension. Adds a context menu.

var contextMenuId = "decoder";

chrome.runtime.onInstalled.addListener(function(details) {
	// First remove all previous context menus and call callback
	// upon success.
	chrome.contextMenus.removeAll(function() {
		// Once they've been removed add this one.
		chrome.contextMenus.create({
			id: contextMenuId,
			title: "Decode image",
			contexts: [ "image" ]
		});
	});
});

chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.local.set({key: ''}, function(){});
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: [new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {urlMatches: '.*'},
        })
        ],
            actions: [new chrome.declarativeContent.ShowPageAction()]
      }]);
    });
});

function embedMessage(info, tab, url, message) {
    chrome.tabs.executeScript(tab.id, {
        file: "get_element.js",
        allFrames: false
        }, function() {
            // Once the call back is installed send a message that
            // we wish to obtain the active element.
            chrome.tabs.sendMessage(tab.id, {
                messageId: "embedElement",
                targetUrl: url,
                targetMessage: message,
                pageUrl: info.pageUrl,
                frameUrl: info.frameUrl
            }, function() {});
        });
}

// This gives us the element (image) that was clicked.
async function processUrls(info, tab, urls, key) {
    let stego = await StegoInterface();
	for (let url of urls) {
        stego.read_url(url, key, function(message, type) {
            if (message != null) {
                embedMessage(info, tab, url, message);
            } else {
                console.log(url, "didn't have a message");
            }
        });
	}
}

function getImgElements(info, tab) {
    chrome.tabs.executeScript(tab.id, {
        file: "get_element.js",
        allFrames: false
        }, function() {
            // Once the call back is installed send a message that
            // we wish to obtain the active element.
            chrome.tabs.sendMessage(tab.id, {
                messageId: "getElement",
                pageUrl: info.pageUrl,
                frameUrl: info.frameUrl
            }, function(urls) { 
                // Get key and call process.
                chrome.storage.local.get('key', function(items){
                    console.log(items);
                    processUrls(info, tab, urls, items.key);
                });
            });
        });
}

function contextMenu(info, tab) {
	if (info.menuItemId == contextMenuId) {
		// This will attach a message listener, which will be removed
		// as soon as it's called and returns the active element.
        getImgElements(info, tab);
	} else {
		console.log("Unexpected context menu id: ", info);
	}
}

// Add listener for our context menu.
chrome.contextMenus.onClicked.addListener(contextMenu);
