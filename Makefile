GTAG_ID ?= G-2M5J6ZC37Z
FILE ?= index.html

define GTAG_SNIPPET
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=$(GTAG_ID)"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '$(GTAG_ID)');
</script>
endef
export GTAG_SNIPPET

.PHONY: inject-gtag

# Insert the Google Analytics snippet right after the placeholder comment in $(FILE).
inject-gtag:
	@printf '%s\n' "$$GTAG_SNIPPET" > .gtag-snippet.tmp
	@awk 'BEGIN{while((getline line < ".gtag-snippet.tmp")>0) snippet=snippet line ORS} {print} /Google tag \(gtag\.js\) will be ingested here/{printf "%s", snippet}' "$(FILE)" > "$(FILE).tmp"
	@mv "$(FILE).tmp" "$(FILE)"
	@rm -f .gtag-snippet.tmp
	@echo "Injected Google Analytics ($(GTAG_ID)) into $(FILE)"
