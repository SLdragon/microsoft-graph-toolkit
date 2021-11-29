/**
 * -------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.
 * See License in the project root for license information.
 * -------------------------------------------------------------------------------------------
 */

import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';
import { customElement, html, property, TemplateResult } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map';
import { Providers, ProviderState, MgtTemplatedComponent, BetaGraph } from '@microsoft/mgt-element';
import '../../styles/style-helper';
import '../sub-components/mgt-spinner/mgt-spinner';
import { getSvg, SvgIcon } from '../../utils/SvgHelper';
import { debounce } from '../../utils/Utils';
import { styles } from './mgt-teams-channel-picker-css';
import { getAllMyTeams, getTeamsPhotosforPhotoIds } from './mgt-teams-channel-picker.graph';
import { strings } from './strings';
import { fluentTreeView, fluentTreeItem, treeItemStyles, fluentTextField } from '@fluentui/web-components';
import { registerFluentComponents } from '../../utils/FluentComponents';
import { tsExpressionWithTypeArguments } from '@babel/types';

registerFluentComponents(fluentTreeView, fluentTreeItem, fluentTextField);

/**
 * Team with displayName
 *
 * @export
 * @interface SelectedChannel
 */
export type Team = MicrosoftGraph.Team & {
  /**
   * Display name Of Team
   *
   * @type {string}
   */
  displayName?: string;
};

/**
 * Selected Channel item
 *
 * @export
 * @interface SelectedChannel
 */
export interface SelectedChannel {
  /**
   * Channel
   *
   * @type {MicrosoftGraph.Channel}
   * @memberof SelectedChannel
   */
  channel: MicrosoftGraph.Channel;

  /**
   * Team
   *
   * @type {MicrosoftGraph.Team}
   * @memberof SelectedChannel
   */
  team: Team;
}

/**
 * Drop down menu item
 *
 * @export
 * @interface DropdownItem
 */
interface DropdownItem {
  /**
   * Teams channel
   *
   * @type {DropdownItem[]}
   * @memberof DropdownItem
   */
  channels?: DropdownItem[];
  /**
   * Microsoft Graph Channel or Team
   *
   * @type {(MicrosoftGraph.Channel | MicrosoftGraph.Team)}
   * @memberof DropdownItem
   */
  item: MicrosoftGraph.Channel | Team;
}

/**
 * Drop down menu item state
 *
 * @interface DropdownItemState
 */
interface ChannelPickerItemState {
  /**
   * Microsoft Graph Channel or Team
   *
   * @type {(MicrosoftGraph.Channel | MicrosoftGraph.Team)}
   * @memberof ChannelPickerItemState
   */
  item: MicrosoftGraph.Channel | Team;
  /**
   * if dropdown item shows expanded state
   *
   * @type {boolean}
   * @memberof DropdownItemState
   */
  isExpanded?: boolean;
  /**
   * If item contains channels
   *
   * @type {ChannelPickerItemState[]}
   * @memberof DropdownItemState
   */
  channels?: ChannelPickerItemState[];
  /**
   * if Item has parent item (team)
   *
   * @type {ChannelPickerItemState}
   * @memberof DropdownItemState
   */
  parent: ChannelPickerItemState;
}

/**
 * Configuration object for the TeamsChannelPicker component
 *
 * @export
 * @interface MgtTeamsChannelPickerConfig
 */
export interface MgtTeamsChannelPickerConfig {
  /**
   * Sets or gets whether the teams channel picker component should use
   * the Teams based scopes instead of the User and Group based scopes
   *
   * @type {boolean}
   */
  useTeamsBasedScopes: boolean;
}

/**
 * Web component used to select channels from a User's Microsoft Teams profile
 *
 *
 * @class MgtTeamsChannelPicker
 * @extends {MgtTemplatedComponent}
 *
 * @fires selectionChanged - Fired when the selection changes
 *
 * @cssprop --color - {font} Default font color
 *
 * @cssprop --input-border - {String} Input section entire border
 * @cssprop --input-border-top - {String} Input section border top only
 * @cssprop --input-border-right - {String} Input section border right only
 * @cssprop --input-border-bottom - {String} Input section border bottom only
 * @cssprop --input-border-left - {String} Input section border left only
 * @cssprop --input-background-color - {Color} Input section background color
 * @cssprop --input-border-color--hover - {Color} Input border hover color
 * @cssprop --input-border-color--focus - {Color} Input border focus color
 *
 * @cssprop --dropdown-background-color - {Color} Background color of dropdown area
 * @cssprop --dropdown-item-hover-background - {Color} Background color of channel or team during hover
 * @cssprop --dropdown-item-selected-background - {Color} Background color of selected channel
 *
 * @cssprop --arrow-fill - {Color} Color of arrow svg
 * @cssprop --placeholder-color--focus - {Color} Color of placeholder text during focus state
 * @cssprop --placeholder-color - {Color} Color of placeholder text
 *
 */
@customElement('mgt-teams-channel-picker')
export class MgtTeamsChannelPicker extends MgtTemplatedComponent {
  /**
   * Array of styles to apply to the element. The styles should be defined
   * user the `css` tag function.
   */
  static get styles() {
    return styles;
  }

  protected get strings() {
    return strings;
  }

  /**
   * Global Configuration object for all
   * teams channel picker components
   *
   * @static
   * @type {MgtTeamsChannelPickerConfig}
   * @memberof MgtTeamsChannelPicker
   */
  public static get config(): MgtTeamsChannelPickerConfig {
    return this._config;
  }

  private static _config = {
    useTeamsBasedScopes: false
  };

  /**
   * Gets Selected item to be used
   *
   * @readonly
   * @type {SelectedChannel}
   * @memberof MgtTeamsChannelPicker
   */
  public get selectedItem(): SelectedChannel {
    if (this._selectedItemState) {
      return { channel: this._selectedItemState.item, team: this._selectedItemState.parent.item };
    } else {
      return null;
    }
  }

  /**
   * Get the scopes required for teams channel picker
   *
   * @static
   * @return {*}  {string[]}
   * @memberof MgtTeamsChannelPicker
   */
  public static get requiredScopes(): string[] {
    if (this.config.useTeamsBasedScopes) {
      return ['team.readbasic.all', 'channel.readbasic.all'];
    } else {
      return ['user.read.all', 'group.read.all'];
    }
  }

  private set items(value) {
    if (this._items === value) {
      return;
    }
    this._items = value;
    this._treeViewState = value ? this.generateTreeViewState(value) : [];
    this.resetFocusState();
  }
  private get items(): DropdownItem[] {
    return this._items;
  }

  // User input in search
  private get _input(): any {
    return this.renderRoot.querySelector('fluent-text-field');
  }
  private _inputValue: string = '';

  private _isFocused = false;

  private _selectedItemState: ChannelPickerItemState;
  private _items: DropdownItem[];
  private _treeViewState: ChannelPickerItemState[] = [];

  // focus state
  private _focusList: ChannelPickerItemState[] = [];
  private _focusedIndex: number = -1;
  private debouncedSearch;

  private teamsPhotos = {};

  // determines loading state
  @property({ attribute: false }) private _isDropdownVisible;

  constructor() {
    super();
    this.handleWindowClick = this.handleWindowClick.bind(this);
    this.addEventListener('keydown', e => this.onUserKeyDown(e));
    this.addEventListener('focus', _ => this.loadTeamsIfNotLoaded());
    this.addEventListener('mouseover', _ => this.loadTeamsIfNotLoaded());
  }

  /**
   * Invoked each time the custom element is appended into a document-connected element
   *
   * @memberof MgtTeamsChannelPicker
   */
  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener('click', this.handleWindowClick);
  }

  /**
   * Invoked each time the custom element is disconnected from the document's DOM
   *
   * @memberof MgtTeamsChannelPicker
   */
  public disconnectedCallback() {
    window.removeEventListener('click', this.handleWindowClick);
    super.disconnectedCallback();
  }

  /**
   * selects a channel by looking up the id in the Graph
   *
   * @param {string} channelId MicrosoftGraph.Channel.id
   * @returns {Promise<return>} A promise that will resolve to true if channel was selected
   * @memberof MgtTeamsChannelPicker
   */
  public async selectChannelById(channelId: string): Promise<boolean> {
    const provider = Providers.globalProvider;
    if (provider && provider.state === ProviderState.SignedIn) {
      // since the component normally handles loading on hover, forces the load for items
      if (!this.items) {
        await this.requestStateUpdate();
      }

      for (const item of this._treeViewState) {
        for (const channel of item.channels) {
          if (channel.item.id === channelId) {
            this.selectChannel(channel);
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Invoked on each update to perform rendering tasks. This method must return a lit-html TemplateResult.
   * Setting properties inside this method will not trigger the element to update.
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  public render() {
    const iconClasses = {
      focused: this._isFocused && !!this._selectedItemState,
      'search-icon': true
    };

    const dropdownClasses = {
      dropdown: true,
      visible: this._isDropdownVisible
    };

    return (
      this.renderTemplate('default', { teams: this.items }) ||
      html`
        <div class="root" @blur=${this.lostFocus} dir=${this.direction}>
        ${this.renderInput()}
          <div class=${classMap(dropdownClasses)}>
          <fluent-tree-view>
          ${this.renderDropdown()}
          </fluent-tree-view>
        </div>
        </div>
      `
    );
  }

  /**
   * Clears the state of the component
   *
   * @protected
   * @memberof MgtTeamsChannelPicker
   */
  protected clearState(): void {
    this._items = [];
    this._inputValue = '';
    this._treeViewState = [];
    this._focusList = [];
  }

  /**
   * Renders search icon
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderSearchIcon() {
    return html`
      <div class="search-icon">
        ${getSvg(SvgIcon.Search, '#252424')}
      </div>
    `;
  }

  /**
   * Renders input field
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderInput() {
    const inputClasses = {
      focused: this._isFocused,
      'hide-icon': !!this._selectedItemState,
      selected: !!this._selectedItemState
    };

    let teamChannel = '';
    let icon: TemplateResult;
    if (this._selectedItemState) {
      icon = html`
      <img class="team-photo" src=${this.teamsPhotos[this._selectedItemState.parent.item.id].photo} />
     `;

      teamChannel = this._selectedItemState.parent.item.displayName + ' > ' + this._selectedItemState.item.displayName;
    } else {
      teamChannel = this._inputValue;
    }

    let input = html`
    <fluent-text-field 
    @click=${() => this.gainedFocus()}
    @keyup=${e => this.handleInputChanged(e)}
    class=${classMap(
      inputClasses
    )} appearance="outline" placeholder="Select a channel" current-value=${teamChannel}  type="text">
      ${icon}
    </fluent-text-field>
    ${this.renderCloseButton()}
  `;

    return input;
  }

  /**
   * Renders close button
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderCloseButton() {
    let icon: TemplateResult;

    const closeIcon = html`
      <div class="close-icon" @click="${() => this.selectChannel(null)}">
        
      </div>
    `;
    const openDropDownIcon = html`
      <div class="close-icon chevron" @click=${() => this.gainedFocus()}>
        <span>\uE70D</span>
      </div>
    `;
    const closeDropDownIcon = html`
      <div class="close-icon chevron" @click=${() => this.lostFocus()}>
        <span>\uE70E</span>
      </div>
    `;

    if (this._selectedItemState) {
      icon = closeIcon;
    } else {
      this._isFocused ? (icon = closeDropDownIcon) : (icon = openDropDownIcon);
    }

    return icon;
  }

  /**
   * Renders dropdown content
   *
   * @param {ChannelPickerItemState[]} items
   * @param {number} [level=0]
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderDropdown() {
    if (this.isLoadingState || !this._treeViewState) {
      return this.renderLoading();
    }

    if (this._treeViewState) {
      if (!this.isLoadingState && this._treeViewState.length === 0 && this._inputValue.length > 0) {
        return this.renderError();
      }

      return this.renderDropdownList(this._treeViewState);
    }

    return html``;
  }

  /**
   * Renders the dropdown list recursively
   *
   * @protected
   * @param {ChannelPickerItemState[]} items
   * @param {number} [level=0]
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderDropdownList(items: ChannelPickerItemState[], level: number = 0) {
    if (items && items.length) {
      return items.map((treeItem, index) => {
        const isLeaf = !treeItem.channels;
        const renderChannels = true;
        let isSelected = false;
        if (this.selectedItem) {
          console.log('this is true', this.selectedItem.team);
          if (this.selectedItem.channel === treeItem.item) {
            isSelected = true;
          }
        }
        if (treeItem.isExpanded || (this.selectedItem && this.selectedItem.team == treeItem.item)) {
          return html`   
              <fluent-tree-item @click=${() => this.handleItemClick(treeItem)} expanded>
              ${this.renderItem(treeItem)}
                ${renderChannels ? this.renderDropdownList(treeItem.channels, level + 1) : html``}
              </fluent-tree-item>
            `;
        } else {
          const classes = {
            selected: isSelected
          };
          return html`   
            <fluent-tree-item class="${classMap(classes)}" @click=${() => this.handleItemClick(treeItem)}>
            ${this.renderItem(treeItem)}
              ${renderChannels ? this.renderDropdownList(treeItem.channels, level + 1) : html``}
            </fluent-tree-item>
        `;
        }
      });
    }

    return null;
  }

  /**
   * Renders each Channel or Team
   *
   * @param {ChannelPickerItemState} itemState
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderItem(itemState: ChannelPickerItemState) {
    let icon: TemplateResult = null;

    if (itemState.channels) {
      // must be team with channels
      icon = html`
       <img class="team-photo" src=${this.teamsPhotos[itemState.item.id].photo} />
      `;
    }

    const classes = {
      focused: this._focusList[this._focusedIndex] === itemState,
      item: true,
      'list-team': itemState.channels ? true : false
    };

    const dropDown = this.renderRoot.querySelector('.dropdown');

    if (dropDown.children[this._focusedIndex]) {
      dropDown.children[this._focusedIndex].scrollIntoView(false);
    }

    return html`
      <div class="${classMap(classes)}">
          ${icon}
        ${itemState.channels ? itemState.item.displayName : this.renderHighlightedText(itemState.item)}
      </div>
    `;
  }

  /**
   * Renders the channel with the query text higlighted
   *
   * @protected
   * @param {*} channel
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderHighlightedText(channel: any) {
    // tslint:disable-next-line: prefer-const
    let channels: any = {};

    const highlightLocation = channel.displayName.toLowerCase().indexOf(this._inputValue.toLowerCase());
    if (highlightLocation !== -1) {
      // no location
      if (highlightLocation === 0) {
        // highlight is at the beginning of sentence
        channels.first = '';
        channels.highlight = channel.displayName.slice(0, this._inputValue.length);
        channels.last = channel.displayName.slice(this._inputValue.length, channel.displayName.length);
      } else if (highlightLocation === channel.displayName.length) {
        // highlight is at end of the sentence
        channels.first = channel.displayName.slice(0, highlightLocation);
        channels.highlight = channel.displayName.slice(highlightLocation, channel.displayName.length);
        channels.last = '';
      } else {
        // highlight is in middle of sentence
        channels.first = channel.displayName.slice(0, highlightLocation);
        channels.highlight = channel.displayName.slice(highlightLocation, highlightLocation + this._inputValue.length);
        channels.last = channel.displayName.slice(
          highlightLocation + this._inputValue.length,
          channel.displayName.length
        );
      }
    } else {
      channels.last = channel.displayName;
    }

    return html`
      <div class="channel-display">
        <div class="showing">
          <span class="channel-name-text">${channels.first}</span
          ><span class="channel-name-text highlight-search-text">${channels.highlight}</span
          ><span class="channel-name-text">${channels.last}</span>
        </div>
      </div>
    `;
  }

  /**
   * Renders an error message when no channel or teams match the query
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderError(): TemplateResult {
    const template = this.renderTemplate('error', null, 'error');

    return (
      template ||
      html`
        <div class="message-parent">
          <div label="search-error-text" aria-label="We didn't find any matches." class="search-error-text">
            ${this.strings.noResultsFound}
          </div>
        </div>
      `
    );
  }

  /**
   * Renders loading spinner while channels are fetched from the Graph
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderLoading(): TemplateResult {
    const template = this.renderTemplate('loading', null, 'loading');

    return (
      template ||
      html`
        <div class="message-parent">
          <mgt-spinner></mgt-spinner>
          <div label="loading-text" aria-label="loading" class="loading-text">
            ${this.strings.loadingMessage}
          </div>
        </div>
      `
    );
  }

  /**
   * Queries Microsoft Graph for Teams & respective channels then sets to items list
   *
   * @protected
   * @memberof MgtTeamsChannelPicker
   */
  protected async loadState() {
    const provider = Providers.globalProvider;
    let teams: MicrosoftGraph.Team[];
    let photos;
    if (provider && provider.state === ProviderState.SignedIn) {
      const graph = provider.graph.forComponent(this);

      // make sure we have the needed scopes
      if (!(await provider.getAccessTokenForScopes(...MgtTeamsChannelPicker.requiredScopes))) {
        return;
      }

      teams = await getAllMyTeams(graph);
      teams = teams.filter(t => !t.isArchived);

      let teamsIds = teams.map(t => t.id);

      const beta = BetaGraph.fromGraph(graph);

      photos = await getTeamsPhotosforPhotoIds(beta, teamsIds);

      const batch = graph.createBatch();

      for (const team of teams) {
        batch.get(team.id, `teams/${team.id}/channels`);
      }

      const responses = await batch.executeAll();

      for (const team of teams) {
        const response = responses.get(team.id);

        if (response && response.content && response.content.value) {
          team.channels = response.content.value.map(c => {
            return {
              item: c
            };
          });
        }
      }

      this.items = teams.map(t => {
        return {
          channels: t.channels as DropdownItem[],
          item: t
        };
      });
    }
    this.filterList();
    this.resetFocusState();

    this.teamsPhotos = photos;
  }

  private handleItemClick(item: ChannelPickerItemState) {
    if (item.channels) {
      item.isExpanded = !item.isExpanded;
    } else {
      this.selectChannel(item);
    }

    this._focusedIndex = -1;
    this.resetFocusState();
  }

  private handleInputChanged(e) {
    if (this._inputValue !== e.target.value) {
      this._inputValue = e.target.value;
    } else {
      return;
    }

    if (this.selectedItem) {
      if (e.target.value) {
        this._inputValue = this._inputValue.split(this.selectedItem.channel.displayName).pop();
        this.filterList();
        this._selectedItemState = null;
      }
    }

    // shows list
    this.gainedFocus();

    if (!this.debouncedSearch) {
      this.debouncedSearch = debounce(() => {
        this.filterList();
      }, 400);
    }

    this.debouncedSearch();
  }

  private filterList() {
    if (this.items) {
      this._treeViewState = this.generateTreeViewState(this.items, this._inputValue);
      this._focusedIndex = -1;
      this.resetFocusState();
    }
  }

  private generateTreeViewState(
    tree: DropdownItem[],
    filterString: string = '',
    parent: ChannelPickerItemState = null
  ): ChannelPickerItemState[] {
    const treeView: ChannelPickerItemState[] = [];
    filterString = filterString.toLowerCase();

    if (tree) {
      for (const state of tree) {
        let stateItem: ChannelPickerItemState;

        if (filterString.length === 0 || state.item.displayName.toLowerCase().includes(filterString)) {
          stateItem = { item: state.item, parent };
          if (state.channels) {
            stateItem.channels = this.generateTreeViewState(state.channels, '', stateItem);
            stateItem.isExpanded = filterString.length > 0;
          }
        } else if (state.channels) {
          const newStateItem = { item: state.item, parent };
          const channels = this.generateTreeViewState(state.channels, filterString, newStateItem);
          if (channels.length > 0) {
            stateItem = newStateItem;
            stateItem.channels = channels;
            stateItem.isExpanded = true;
          }
        }

        if (stateItem) {
          treeView.push(stateItem);
        }
      }
    }
    return treeView;
  }

  // generates a flat list from a tree to facilitate easier focus
  // navigation
  private generateFocusList(items): any[] {
    if (!items || items.length === 0) {
      return [];
    }

    let array = [];

    for (const item of items) {
      array.push(item);
      if (item.channels && item.isExpanded) {
        array = [...array, ...this.generateFocusList(item.channels)];
      }
    }

    return array;
  }

  private resetFocusState() {
    this._focusList = this.generateFocusList(this._treeViewState);
    this.requestUpdate();
  }

  private loadTeamsIfNotLoaded() {
    if (!this.items && !this.isLoadingState) {
      this.requestStateUpdate();
    }
  }

  private handleWindowClick(e: MouseEvent) {
    if (e.target !== this) {
      this.lostFocus();
    }
  }

  private onUserKeyDown(event: KeyboardEvent) {
    if (event.keyCode === 13) {
      // No new line
      event.preventDefault();
    }

    if (this._treeViewState.length === 0) {
      return;
    }

    const currentFocusedItem = this._focusList[this._focusedIndex];

    let treeList: HTMLElement = this.renderRoot.querySelector('fluent-tree-item');
    let input: HTMLElement = this.renderRoot.querySelector('fluent-text-field');

    switch (event.keyCode) {
      case 40: // down
        if (this._focusedIndex === -1) {
          treeList.focus();
        }
        if (this._focusedIndex < this._focusList.length - 1) {
          this._focusedIndex = this._focusedIndex + 1;
        }
        break;
      case 38: // up
        if (this._focusedIndex === 0) {
          input.focus();
          this._focusedIndex--;
        } else {
          if (this._focusedIndex > 0) {
            this._focusedIndex--;
          }
        }
        break;
      case 9: // tab
        if (!currentFocusedItem) {
          this.lostFocus();
          break;
        }
      case 13: // return/enter
        if (currentFocusedItem && currentFocusedItem.channels) {
          console.log(currentFocusedItem);
          // focus item is a Team
          currentFocusedItem.isExpanded = !currentFocusedItem.isExpanded;
          this._focusList = this.generateFocusList(this._treeViewState);
        } else if (currentFocusedItem && !currentFocusedItem.channels) {
          console.log('this happens');
          this.selectChannel(currentFocusedItem);

          // refocus to new textbox on initial selection
          this.resetFocusState();
          this._focusedIndex = -1;
          event.preventDefault();
        }
        break;
      case 8: // backspace
        if (this._inputValue.length === 0 && this._selectedItemState) {
          this.selectChannel(null);
          event.preventDefault();
        }
        break;
      case 27: // esc
        this.selectChannel(this._selectedItemState);
        this._focusedIndex = -1;
        this.resetFocusState();
        event.preventDefault();
        break;
    }
  }

  private gainedFocus() {
    this._isFocused = true;
    const input = this._input;
    if (input) {
      input.focus();
    }

    this._focusedIndex = -1;
    this._isDropdownVisible = true;
  }

  private lostFocus() {
    this._isFocused = false;
    const input = this._input;
    if (input && !this.selectedItem) {
      input.value = this._inputValue = '';
    }

    this._isDropdownVisible = false;
    this.filterList();
  }

  private selectChannel(item: ChannelPickerItemState) {
    if (this._selectedItemState !== item) {
      this._selectedItemState = item;
      this.fireCustomEvent('selectionChanged', item ? [this.selectedItem] : []);
    }

    const input = this._input;
    if (input) {
      input.value = this._inputValue = '';
    }
    this.requestUpdate();
    this.lostFocus();
  }
}
