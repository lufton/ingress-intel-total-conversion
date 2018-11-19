// ==UserScript==
// @id             iitc-plugin-planner@lufton
// @name           IITC plugin: Planner
// @category       Layout
// @version        0.8.1.@@DATETIMEVERSION@@
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Make linking plan from Draw Tools drawing.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @include        https://www.ingress.com/mission/*
// @include        http://www.ingress.com/mission/*
// @match          https://www.ingress.com/mission/*
// @match          http://www.ingress.com/mission/*
// @grant          none
// ==/UserScript==
// Used icon pack: http://findicons.com/pack/2166/oxygen

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////
// python build.py local ; cp "/Users/filial/WebstormProjects/ingress-intel-total-conversion/build/local/plugins/planner.user.js" "/Users/filial/Library/Application Support/Firefox/Profiles/e0ows3uz.default/gm_scripts/IITC_plugin_Planner"
// build.py local & copy D:\Users\lufton\Projects\iitc\build\local\plugins\planner.user.js C:\Users\Lufton\AppData\Roaming\Mozilla\Firefox\Profiles\vn2hzzee.default\gm_scripts\IITC_plugin_Planner /Y & powershell -c (New-Object Media.SoundPlayer "C:\Windows\Media\notify.wav").PlaySync();
// use own namespace for plugin
window.plugin = window.plugin || function() {};
window.plugin.planner = function() {};

var setup = function() {
    $.extend(window.plugin.planner, {
        layer: new L.FeatureGroup(),
        updateLinksTimer: null,
        delayedUpdateLinksDelay: 500,
        links: [],
        teams: [],
        portals: {},
        init: function() {
            var me = this;
            if (!window.plugin.drawTools) {
                alert('Draw Tools plugin is required!');
                return;
            }
            // Import CSS styles
            $('<style>').prop('type', 'text/css').html('@@INCLUDESTRING:plugins/planner.css@@').appendTo('head');
            // Hook Request Finished and delay links update
            window.addHook('requestFinished', function() {
                me.delayedUpdateLinks();
            });
            // Hook for Draw Tools events, just update links
            window.pluginCreateHook('pluginDrawTools');
            window.addHook('pluginDrawTools', function() {
                me.updateLinks();
            });
            // Add chat tabs
            $('#chatcontrols')
                .append('<a style="display: none" id="planner-portals-tab">portals <span class="print portals"></span></a>')
                .append('<a style="display: none" id="planner-links-tab">links <span class="print links"></span></a>');
            // Add chat portals and links placeholders
            $('#chat')
                .append('<div style="display: none" id="planner-portals"><table border="1" cellpadding="0" cellspacing="0" width="100%"><thead><th style="width: 20px;">#</th><th>Title</th><th>Links to</th><th style="width: 50px;">Keys</th></thead><tbody id="planner-portals-table"></tbody></table></div>')
                .append('<div style="display: none" id="planner-links">Teams number: <input id="teamsCount" type="text" name="teams" value="1" /><div id="teams"></div></div>');
            $('#planner-links').on('click', 'h3 span.title', function() {
                var title = prompt('Enter team name:', $(this).text());
                var team = me.teams[$(this).closest('h3').next().find('table').data('id')];
                if (title) {
                    $(this).text(title);
                    team.setTitle(title);
                }
                plugin.planner.save();
            });
            // Add toolbox menu
            $('#toolbox').append('<a onclick="window.plugin.planner.showDialog();return false;">Planner</a>');
            // Initialize teams links accordion
            $('#teams').accordion({
                heightStyle: 'content'
            });
            // On new tab click make tab active and show new content
            $('#planner-portals-tab,#planner-links-tab').click(function() {
                $('#chat > div').hide();
                $('#chatcontrols .active').removeClass('active');
                $(this).addClass('active');
                $($(this).is('#planner-portals-tab')?'#planner-portals':'#planner-links').show();
            });
            // On click "print" span print data
            $('#chatcontrols .print').click(function() {
                if($(this).hasClass('portals')) me.printPortalList();
                else if($(this).hasClass('links')) me.printLinkList();
            });
            // Initialize teams count spinner
            $('#teamsCount').spinner({
                min: 1,
                max: me.getTeamColors().length,
                change: function() {
                    var value = $(this).val();
                    var count = $('#teams > div').length;
                    for (var i = count; i < value; i++) me.addTeam();
                    for (var i = value; i < count; i++) me.removeTeam();
                    me.save();
                }
            });
            // On planner layer enabled update links and show planner interface
            map.on('layeradd', function(obj) {
                if (obj.layer==me.layer) {
                    $('#planner-portals-tab,#planner-links-tab,#planner-portals,#planner-links').show();
                }
            });
            // On planner layer disable hide planner interface
            map.on('layerremove', function(obj) {
                if (obj.layer==me.layer) {
                    $('#planner-portals-tab,#planner-links-tab,#planner-portals,#planner-links').hide();
                    chat.chooseTab('all');
                }
            });
            // Add new layer to layer chooser
            window.addLayerGroup('Planner', me.layer, true);
            // Load saved state
            me.load();
        },
        // Daleyed start of updateLinks method
        delayedUpdateLinks: function () {
            var me = this;
            if (this.updateLinksTimer) {
                clearTimeout(this.updateLinksTimer);
                this.updateLinksTimer = 0;
            }
            this.updateLinksTimer = setTimeout(function () {
                me.updateLinks.call(me);
            }, me.delayedUpdateLinksDelay);
            console.log('Links update will start in 3000ms');
        },
        hasLinkWithLatLngs: function(latLng1, latLng2) {
            var count = this.links.filter(function(link) {
                return (link.getPortal1().getLatLng().equals(latLng1) && link.getPortal2().getLatLng().equals(latLng2)) ||
                    (link.getPortal1().getLatLng().equals(latLng2) && link.getPortal2().getLatLng().equals(latLng1))
            }).length;
            return count > 0;
        },
        findPortalByLatLng: function(latLng) {
            var guid = window.findPortalGuidByPositionE6(Math.ceil(latLng.lat * 1E6), Math.ceil(latLng.lng * 1E6));
            if (!guid) $.each(window.portals, function(id, portal) {
                if (!guid && latLng.equals(L.latLng(portal.options.data.latE6 / 1E6, portal.options.data.lngE6 / 1E6))) guid = id;
            });
            if (!guid) $.each(this.portals, function(id, portal) {
                if (!guid && latLng.equals(L.latLng(portal.getLatLng()))) guid = id;
            });
            if (guid) {
                var data = window.portals[guid] || this.portals[guid];
                if (data && data.options && data.options.data.title) {
                    var portal = new L.Portal({
                        guid: guid,
                        title: data.options.data.title,
                        latLng: new L.LatLng(data.options.data.latE6 / 1E6, data.options.data.lngE6 / 1E6)
                    });
                    if (!$('#planner-portals-table tr[data-guid="' + guid + '"]').length) $('#planner-portals-table').append('<tr data-guid="' + guid + '"><td align="center">'+($('#planner-portals-table tr').length + 1)+'</td><td>' + portal.getLink() + '</td><td><ul></ul></td><td align="center">0</td></tr>');
                    this.portals[guid] = portal;
                    return portal;
                }
            }
            return null;
        },
        // Check if all Draw Tools items has corresponding links on the layer
        // and remove all links and portals if there is links and portals
        // that has corresponded edge and portals removed from Draw Tools
        updateLinks: function() {
            var me = this;
            // Walking across all Draw Tools layers
            plugin.drawTools.drawnItems.eachLayer(function(layer) {
                // In case layer has latLngs property (polyline, polygon)
                var lls = layer.getLatLngs && layer.getLatLngs();
                if (lls) {
                    // Walking across all points of the layer
                    // If it is Polyline then pass last edge
                    for (var i = 0; i < lls.length - (layer instanceof L.GeodesicPolyline ? 1 : 0); i++) {
                        // Continue loop if there is such link
                        if (me.hasLinkWithLatLngs(lls[i], lls[(i+1)%lls.length])) continue;
                        // Find portals by LatLngs
                        var portal1 = me.findPortalByLatLng(lls[i]),
                            portal2 = me.findPortalByLatLng(lls[(i+1)%lls.length]);
                        // If there is such portals and portals has detailed data
                        if(portal1 && portal2) {
                            // Create corresponding link
                            var link = new L.Link(portal1, portal2);
                            me.links.push(link);
                        }
                    }
                }
            });
            var linksToRemove = [];
            // Walking across each link on the layer
            $.each(me.links, function (i, link) {
                var lls = link.getLatLngs && link.getLatLngs();
                if (lls) {
                    // If no one of Draw Tools items has corresponding edge
                    // then add link to ToBeRemoved list
                    if (!me.hasDrawToolsEdge(lls[0], lls[1])) linksToRemove.push(link);
                }
            });
            // Remove all links from ToBeRemoved list
            $.each(linksToRemove, function(i, link) {
                // Remove link information from links table and data from portals table
                link.remove();
            });
            me.layer.bringToFront();
            me.save();
            console.log('Done updating links');
        },
        // Check if Draw Tools items has edge corresponded to specified link
        hasDrawToolsEdge: function (ll1, ll2) {
            var result = false;
            plugin.drawTools.drawnItems.eachLayer(function (layer) {
                var lls = layer.getLatLngs && layer.getLatLngs();
                if (lls && !result) {
                    for (var i = 0; i < lls.length - (layer instanceof L.GeodesicPolyline ? 1 : 0); i++) {
                        if (
                            (lls[i].equals(ll1) && lls[(i+1)%lls.length].equals(ll2)) ||
                            (lls[i].equals(ll2) && lls[(i+1)%lls.length].equals(ll1))
                        ) result = true;
                    }
                }
            });
            return result;
        },
        // Team colors
        getTeamColors: function() {
            return ['#FF0000', '#FFA500', '#FFFF00', '#008000', '#00BFFF', '#0000FF', '#9400D3'];
        },
        getCurrentTeamNumber: function() {
            return Math.max(0, $('#teams').accordion('option', 'active'));
        },
        getCurrentTeam: function() {
            return this.teams[this.getCurrentTeamNumber()];
        },
        // Add team block
        addTeam: function(team) {
            team = team || new L.Team;
            $('#teams').append(this.teamAccordionHtml(team)).find('tbody').sortable({
                stop: this.reorderLinks
            });
            this.updateSpectrum();
            this.teams.push(team);
            $('#teams').accordion('refresh').accordion('option', 'active', this.teams.length);
        },
        updateSpectrum: function() {
            var me = plugin.planner;
            if ($.fn.spectrum) $('#teams input[type=color]').spectrum({
                flat: false,
                showInput: false,
                showButtons: false,
                showPalette: true,
                showSelectionPalette: false,
                palette: [me.getTeamColors()],
                change: function(color) {
                    var h3 = $(this).closest('h3');
                    var id = h3.next().find('table').data('id');
                    var team = me.teams[id];
                    team.setColor(color.toHexString());
                    $.each(me.links, function(i, link) {
                        if (link.getTeam() == id) {
                            link.setColor(false).setColor(color);
                        }
                    });
                    h3.css('background-color', color.toHexString());
                    plugin.planner.save();
                }
            }); else setTimeout(me.updateSpectrum, 100);
        },
        // Remove team block
        removeTeam: function() {
            var team = this.teams.length - 1;
            // Remove last team block
            $('#teams > h3:last,#teams > div:last').remove();
            // Update accordion after element was removed
            $('#teams').accordion('refresh');
            // Walking across the layer and toggle off layers
            // if layer team is equal to team to be removed
            $.each(this.links, function(i, link) {
                if (link.getTeam() == team) link.setTeam(false);
            });
            this.teams.splice(-1);
        },
        findTeamByColor: function(color) {
            color = color.toLowerCase();
            var t = null;
            $.each(this.teams, function(i, team) {
                if (team.getColor().toLowerCase() == color.toLowerCase()) t = team;
            });
            return t;
        },
        // Generate html block for specified group
        teamAccordionHtml: function(team) {
            return '<h3 style="background-color: ' + team.getColor() + '"><input type="color" value="' + team.getColor() + '" /><span class="title">' + team.getTitle() + '</span></h3>' +
                '<div>' +
                '<table border="1" cellpadding="0" cellspacing="0" width="100%" data-id="' + team.getId() + '">' +
                '<thead>' +
                '<th width="5%">#</th>' +
                '<th width="45%">Link from</th>' +
                '<th width="5%" class="no-print">&nbsp;</th>' +
                '<th width="45%">Link to</th>' +
                '</thead>' +
                '<tbody>' +
                '</tbody>' +
                '</table>' +
                '</div>';
        },
        // Reorder links table
        reorderLinks: function() {
            $('#teams > div tbody').each(function(i, tbody) {
                $(tbody).find('tr td:first-child').each(function(j, td) {
                    $(td).text(j + 1);
                });
            });
        },
        // Handler for two-sided swap arrow click event
        swapHandler: function(el) {
            var tr = $(el).closest('tr');
            var guid1 = tr.data('guid1');
            var guid2 = tr.data('guid2');
            // Search link with portal defined with guid1 and guid2 across all links
            this.layer.eachLayer(function(layer) {
                if (layer.getPortal1() && layer.getPortal2() && (
                        (layer.getPortal1().getGuid()==guid1 && layer.getPortal2().getGuid()==guid2) ||
                        (layer.getPortal1().getGuid()==guid2 && layer.getPortal2().getGuid()==guid1)
                    )
                ) {
                    layer.swap();
                    tr.find('td:nth-child(2)').html(layer.getPortal1().getLink());
                    tr.find('td:nth-child(4)').html(layer.getPortal2().getLink());
                }
            });
        },
        // Open new window for printing html content
        printWindow: function(title, content, w, h) {
            w = w || 650;
            h = h || 600;
            var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;
            var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;

            var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
            var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

            var left = ((width / 2) - (w / 2)) + dualScreenLeft;
            var top = ((height / 2) - (h / 2)) + dualScreenTop;
            var newWindow = window.open('', title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);
            newWindow.document.body.innerHTML = "<style>.no-print, .sp-dd { display: none !important; } table { page-break-after: always; }</style>" + content;

            // Puts focus on the newWindow
            if (window.focus) {
                newWindow.focus();
            }
            newWindow.print();
            return newWindow;
        },
        // Print portals table
        printPortalList: function() {
            this.printWindow('Portal list', '<title>Portals list</title>' + $('#planner-portals').html());
        },
        // Print links table
        printLinkList: function() {
            this.printWindow('Link list', '<title>Links list</title>' + $('#planner-links').clone().find('div').show().html());
        },
        // Generate code
        code: function() {
            var obj = {
                teams: this.teams,
                links: this.links,
                drawTools: localStorage['plugin-draw-tools-layer']
            };
            return JSON.stringify(obj, this._replacer);
        },
        // Save teams, portals and links to localStorage object
        save: function() {
            localStorage['plugin-planner'] = this.code();
        },
        _replacer: function(k, v) {
            return (/^(|\d+|teams|color|links|guid|title|latE6|lngE6|((\d|[a-f]){32}\.\d{2})|links|portal1|portal2|team|latLng|lat|lng|id|drawTools)$/.test(k)) ?
                v : undefined;
        },
        _reviver: function(k, v) {
            switch (k) {
                /*case 'team':
                    return new $.extend(new L.Team, v);*/
                case 'latLng':
                    return new L.LatLng(v.lat, v.lng);
                case 'portal1':
                case 'portal2':
                    return new $.extend(new L.Portal, v);
                default:
                    return v;
            }
        },
        // Load teams, portals and links from localStorage object
        load: function(text) {
            var me = this;
            me.clear();
            var obj = {};
            try {
                 obj = JSON.parse(text || localStorage['plugin-planner'], me._reviver);
            } catch (e) {}
            if (obj.teams) $.each(obj.teams, function(i, team) {
                me.addTeam($.extend(new L.Team, team));
            });
            if (obj.links) $.each(obj.links, function(i, link) {
                me.links.push(new L.Link(link.portal1, link.portal2, link.team));
                if (!me.portals[link.portal1.getGuid()]) me.portals[link.portal1.getGuid()] = link.portal1;
                if (!me.portals[link.portal2.getGuid()]) me.portals[link.portal2.getGuid()] = link.portal2;
            });
            if (!me.teams.length) me.addTeam();
            $('#teamsCount').val(me.teams.length);
            // Loading Draw Tools
            try {
                var data = JSON.parse(obj.drawTools);
                window.plugin.drawTools.drawnItems.clearLayers();
                window.plugin.drawTools.import(data);
                window.plugin.drawTools.save();
            } catch(e) {}
            me.save();
        },
        // Clear teams, portals and links
        clear: function() {
            $('#teams h3,#teams div,#planner-portals tbody tr').remove();
            $.each(this.links, function(i, link) { link.remove(); });
            this.teams = [];
            this.links = [];
            this.portals = {};
        },
        showDialog: function() {
            var html = '<div class="drawtoolsSetbox">'
                + '<a onclick="window.plugin.planner.resetPlan();return false;">Reset plan</a>'
                + '<a onclick="window.plugin.planner.copyCode();return false;">Copy plan code</a>'
                + '<a onclick="window.plugin.planner.pasteCode();return false;">Paste plan code</a>'
                + '</div>';

            dialog({
                html: html,
                id: 'plugin-drawtools-options',
                dialogClass: 'ui-dialog-drawtoolsSet',
                title: 'Draw Tools Options'
            });
        },
        resetPlan: function() {
            if (!confirm('Are you sure you want to reset plan? This action can not be undone.')) return;
            this.clear();
            this.addTeam();
            this.updateLinks();
        },
        copyCode: function() {
            dialog({
                html: '<textarea onclick="$(this).select()" readonly>' + this.code() + '</textarea>',
                id: 'plugin-planner-options',
                dialogClass: 'ui-dialog-drawtoolsSet-copy',
                width: 600,
                title: 'Planner Options'
            });
        },
        pasteCode: function() {
            var code = prompt('Paste code here:');
            if (code) this.load(code);
        }
    });

    L.Portal = (function() {
        function Portal(data) {
            L.extend(this, data);
        }

        Portal.prototype = {
            getGuid: function() {
                return this.guid;
            },
            getLatLng: function() {
                return this.latLng;
            },
            getTitle: function() {
                return this.title;
            },
            equals: function(portal) {
                return this.getLatLng().equals(portal.getLatLng());
            },
            getLink: function() {
                var ll = this.getLatLng().lat + ',' + this.getLatLng().lng;
                return '<a target="_blank" href="https://www.ingress.com/intel?ll=' + ll + '&z=17&pll=' + ll + '" onclick="window.zoomToAndShowPortal(\'' + this.getGuid() + '\', [' + this.getLatLng().lat + ', ' + this.getLatLng().lng + ']);return false;">' + this.getTitle() + '</a>';
            }
        };
        return Portal;
    }());

    L.Team = (function() {
        function Team(data) {
            if (!data) {
                var color = plugin.planner.getTeamColors()[plugin.planner.teams.length];
                data = {
                    id: plugin.planner.teams.length,
                    color: color,
                    title: "Team #" + (plugin.planner.teams.length + 1)
                };
            }
            $.extend(this, data);
        }

        $.extend(Team.prototype, {
            getId: function () { return this.id; }, setId: function (id) { this.id = id; return this; },
            getTitle: function () { return this.title; }, setTitle: function (title) { this.title = title; return this; },
            getColor: function() { return this.color; }, setColor: function (color) { this.color = color; return this; }
        });

        return Team;
    })();

    L.Link = (function() {
        var options = {
            opacity: 1,
            weight: 5,
            color: '#999999',
            dashArray: [15, 10]
        };

        var Link = L.GeodesicPolyline.extend({
            initialize: function (portal1, portal2, team) {
                this.setPortal1(portal1);
                this.setPortal2(portal2);
                var lls = [];
                if (this.getPortal1()) lls.push(this.getPortal1().getLatLng());
                if (this.getPortal2()) lls.push(this.getPortal2().getLatLng());
                L.GeodesicPolyline.prototype.initialize.call(this, lls, options);
                if (team !== undefined) this.setTeam(team);
                this.on('click', function (e) {
                    if ($.isNumeric(this.getTeam())) {
                        this.setTeam(false);
                    } else {
                        if (
                            e.latlng.distanceTo(this.getPortal1().getLatLng()) >
                            e.latlng.distanceTo(this.getPortal2().getLatLng())
                        )
                            this.swap();
                        this.setTeam(plugin.planner.getCurrentTeamNumber());
                    }
                });
                this.addTo(plugin.planner.layer);
                this.on('mouseover', function () {
                });
                this.on('mouseout', function () {
                });
            }
        });

        $.extend(Link.prototype, {
            getPortal1: function() { return this.portal1; }, setPortal1: function(portal) { this.portal1 = portal; },
            getPortal2: function() { return this.portal2; }, setPortal2: function(portal) { this.portal2 = portal; },
            swap: function() {
                var portal1 = this.portal1;
                this.portal1 = this.portal2;
                this.portal2 = portal1;
                this.setLatLngs([this.portal1.getLatLng(), this.portal2.getLatLng()]);
                plugin.planner.save();
            },
            getTeam: function () {
                return this.team;
            },
            setColor: function(color) {
                this.setText(color ? '    ►' : false, {
                    repeat: true,
                    offset: 6,
                    attributes: {
                        'font-weight': 'bold',
                        'font-size': '18',
                        'pointer-events': 'none',
                        fill: color ? color : '#999999'
                    }
                });
                this.setStyle({
                    color: color ? color : '#999999',
                    dashArray: color ? null : [15, 10]
                });
                return this;
            },
            setTeam: function (team) {
                var me = this;
                this.team = team;
                if ($.isNumeric(team)) {
                    $('#teams table[data-id=' + team + '] tbody').append('<tr data-guid1="'+this.getPortal1().getGuid()+'" data-guid2="'+this.getPortal2().getGuid()+'"><td align="center">'+($('#teams table[data-id=' + team + '] tbody tr').length + 1) + '</td><td align="right">' + this.getPortal1().getLink() + '</td><td class="no-print" align="center"><a href="#" onclick="plugin.planner.swapHandler(this)">⇄</a></td><td>' + this.getPortal2().getLink() + '</td></tr>');
                    if (!$('#planner-portals-table tr[data-guid="' + this.getPortal2().getGuid() + '"]').length) $('#planner-portals-table').append('<tr data-guid="' + this.getPortal2().getGuid() + '"><td align="center">'+($('#planner-portals-table tr').length + 1)+'</td><td>' + this.getPortal2().getLink() + '</td><td><ul></ul></td><td align="center">0</td></tr>');
                    $('#planner-portals-table tr[data-guid="' + this.getPortal1().getGuid() + '"] ul').append('<li data-guid="' + this.getPortal2().getGuid() + '">' + this.getPortal2().getLink() + '</li>');
                    $('#planner-portals-table tr[data-guid="' + this.getPortal2().getGuid() + '"] td:last-child').text(parseInt($('#planner-portals-table tr[data-guid="' + this.getPortal2().getGuid() + '"] td:last-child').text()) + 1);
                } else {
                    $('#teams tr[data-guid1="' + this.getPortal1().getGuid() + '"][data-guid2="' + this.getPortal2().getGuid() + '"],#teams tr[data-guid1="' + this.getPortal2().getGuid() + '"][data-guid2="' + this.getPortal1().getGuid() + '"]').remove();
                    $('#planner-portals-table tr[data-guid="' + this.getPortal1().getGuid() + '"] ul li[data-guid="' + this.getPortal2().getGuid() + '"]').remove();
                    $('#planner-portals-table tr[data-guid="' + this.getPortal2().getGuid() + '"] td:last-child').text(parseInt($('#planner-portals-table tr[data-guid="' + this.getPortal2().getGuid() + '"] td:last-child').text())-1);
                }
                me.setColor($.isNumeric(team) ? plugin.planner.teams[team].getColor() : false);
                plugin.planner.save();
                return this;
            },
            remove: function() {
                var me = this;
                me.setTeam(false);
                plugin.planner.layer.removeLayer(me);
                plugin.planner.links = jQuery.grep(plugin.planner.links, function(value) {
                    return value != me;
                });
            },
            equals: function(link) {
                return this.portal1.equals(link.getPortal1()) && this.portal2.equals(link.getPortal2()) ||
                    this.portal1.equals(link.getPortal2()) && this.portal2.equals(link.getPortal1());
            }
        });

        return Link;
    }());

    @@INCLUDERAW:external/leaflet.textpath.js@@

    window.plugin.planner.init();
};

// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@